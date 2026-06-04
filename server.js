const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const yaml = require('js-yaml');
let Client;
try {
  Client = require('ssh2').Client;
} catch (e) {
  console.log("ssh2 module not pre-loaded, will check dynamic load during remote deployment.");
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_PATH = path.join(__dirname, 'database', 'db.json');
const CONFIG_PATH = path.join(__dirname, 'vars', 'network_config.yml');
const INVENTORY_PATH = path.join(__dirname, 'inventory.ini');

// Dynamic directories check
const ensureDirs = () => {
  const dirs = [path.dirname(DB_PATH), path.dirname(CONFIG_PATH)];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

// Seed Database default configuration
const getSeedData = () => ({
  credentials: { username: "admin", password: "admin" },
  ansible_server: {
    target: "remote",
    host: "192.168.1.12",
    port: 22,
    username: "root",
    password: "admin",
    workspace: "/home/admin/ansible-nexus"
  },
  devices: [
    { id: "1779906133235", name: "NXOS-1", ip: "192.168.1.19", role: "leaf-primary" },
    { id: "1779906150343", name: "NXOS-2", ip: "192.168.1.13", role: "leaf-secondary" },
    { id: "1779906170500", name: "SW-L3", ip: "192.168.1.50", role: "downstream" }
  ],
  vpc_domains: [
    {
      domain_id: 10,
      name: "Leaf-Pair-Pod1",
      primary_switch: "NXOS-1",
      secondary_switch: "NXOS-2",
      peer_link: {
        channel_group: 10,
        interfaces: ["Ethernet1/1", "Ethernet1/2"]
      },
      peer_keepalive: {
        primary_ip: "192.168.1.19",
        secondary_ip: "192.168.1.13",
        vrf: "management"
      },
      downstream_connections: [
        {
          id: "link-100",
          target_device_name: "SW-L3",
          channel_group: 100,
          vpc_id: 100,
          primary_member_interfaces: ["Ethernet1/3"],
          secondary_member_interfaces: ["Ethernet1/3"]
        }
      ]
    }
  ],
  vlans: [
    { id: 10, name: "DATA", vpc_domain_id: 10, vip: "10.10.10.254", mask: "24", ip_switch1: "10.10.10.252", ip_switch2: "10.10.10.253", hsrp_priority_switch1: 150, hsrp_priority_switch2: 120 },
    { id: 20, name: "VOICE", vpc_domain_id: 10, vip: "10.10.20.254", mask: "24", ip_switch1: "10.10.20.252", ip_switch2: "10.10.20.253", hsrp_priority_switch1: 150, hsrp_priority_switch2: 120 },
    { id: 1000, name: "GUEST", vpc_domain_id: 10, vip: "10.100.100.254", mask: "23", ip_switch1: "10.100.100.252", ip_switch2: "10.100.100.253", hsrp_priority_switch1: 150, hsrp_priority_switch2: 120 }
  ],
  downstream_port_channels: [],
  downstream_svis: []
});

// Synchronize Database state with local vars/network_config.yml and inventory.ini files
const syncFiles = (dbData) => {
  ensureDirs();

  // 1. Generate vars/network_config.yml
  const yamlData = {
    nexus_devices: dbData.devices,
    vpc_domains: dbData.vpc_domains || [],
    vlans: dbData.vlans || [],
    downstream_port_channels: dbData.downstream_port_channels || [],
    downstream_svis: dbData.downstream_svis || []
  };
  const yamlString = yaml.dump(yamlData, { indent: 2 }).replace(/\r/g, '');
  fs.writeFileSync(CONFIG_PATH, yamlString, 'utf8');

  // 2. Generate inventory.ini dynamically
  const creds = dbData.credentials || { username: "admin", password: "admin" };
  const domains = dbData.vpc_domains || [];
  const devices = dbData.devices || [];
  const nexusLines = [];
  const downstreamLines = [];

  devices.forEach(device => {
    if (device.role && (device.role.includes('leaf') || device.role.includes('spine') || device.role.includes('primary') || device.role.includes('secondary'))) {
      let peer_ip = "";
      let src_ip = "";
      
      const domain = domains.find(d => d.primary_switch === device.name || d.secondary_switch === device.name);
      if (domain) {
        if (domain.primary_switch === device.name) {
          src_ip = domain.peer_keepalive.primary_ip;
          peer_ip = domain.peer_keepalive.secondary_ip;
        } else {
          src_ip = domain.peer_keepalive.secondary_ip;
          peer_ip = domain.peer_keepalive.primary_ip;
        }
      }
      
      let line = `${device.name} ansible_host=${device.ip}`;
      if (peer_ip) line += ` peer_ip=${peer_ip}`;
      if (src_ip) line += ` src_ip=${src_ip}`;
      nexusLines.push(line);
    } else if (device.role && device.role.includes('downstream')) {
      downstreamLines.push(`${device.name} ansible_host=${device.ip}`);
    }
  });

  const inventoryContent = `[nexus]
${nexusLines.join('\n')}

[downstream]
${downstreamLines.join('\n')}

[nexus:vars]
ansible_user=${creds.username}
ansible_password=${creds.password}
ansible_ssh_pass=${creds.password}
ansible_network_os=nxos
ansible_connection=network_cli
ansible_ssh_common_args='-o PubkeyAuthentication=no'

[downstream:vars]
ansible_user=${creds.username}
ansible_password=${creds.password}
ansible_ssh_pass=${creds.password}
ansible_network_os=ios
ansible_connection=network_cli
ansible_ssh_common_args='-o PubkeyAuthentication=no -o KexAlgorithms=+diffie-hellman-group14-sha1,diffie-hellman-group-exchange-sha1,diffie-hellman-group1-sha1 -o HostKeyAlgorithms=+ssh-rsa'
`.replace(/\r/g, '');

  fs.writeFileSync(INVENTORY_PATH, inventoryContent, 'utf8');
};

// GET full configuration database
app.get('/api/config', (req, res) => {
  try {
    ensureDirs();
    if (!fs.existsSync(DB_PATH)) {
      const seed = getSeedData();
      fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2), 'utf8');
    } else {
      // Dynamic migration to multi-domain schema
      try {
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        const data = JSON.parse(raw);
        if (data.vpc_config && !data.vpc_domains) {
          console.log("Migrating database db.json to multi-domain enterprise schema...");
          data.vpc_domains = [
            {
              domain_id: data.vpc_config.domain_id || 10,
              name: "Leaf-Pair-Pod1",
              primary_switch: data.vpc_config.primary_switch_name || "NXOS-1",
              secondary_switch: data.vpc_config.secondary_switch_name || "NXOS-2",
              peer_link: data.vpc_config.peer_link || { channel_group: 10, interfaces: ["Ethernet1/1", "Ethernet1/2"] },
              peer_keepalive: {
                primary_ip: data.vpc_config.keepalive_primary_ip || "192.168.1.19",
                secondary_ip: data.vpc_config.keepalive_secondary_ip || "192.168.1.13",
                vrf: "management"
              },
              downstream_connections: [
                {
                  id: "link-100",
                  target_device_name: "SW-L3",
                  channel_group: data.vpc_config.downstream?.channel_group || 100,
                  vpc_id: data.vpc_config.downstream?.vpc_id || 100,
                  primary_member_interfaces: data.vpc_config.downstream?.interfaces || ["Ethernet1/3"],
                  secondary_member_interfaces: data.vpc_config.downstream?.interfaces || ["Ethernet1/3"]
                }
              ]
            }
          ];
          
          // Migrate vlans
          if (data.vlans) {
            data.vlans.forEach(v => {
              v.vpc_domain_id = 10;
            });
          }
          
          // Migrate devices roles
          if (data.devices) {
            data.devices.forEach(d => {
              if (d.role === 'primary') d.role = 'leaf-primary';
              if (d.role === 'secondary') d.role = 'leaf-secondary';
            });
          }
          
          delete data.vpc_config;
          delete data.hsrp_config;
          
          fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
        }
      } catch (err) {
        console.error("Migration failed, re-seeding fresh data:", err);
        const seed = getSeedData();
        fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2), 'utf8');
      }
    }
    const dbRaw = fs.readFileSync(DB_PATH, 'utf8');
    const dbData = JSON.parse(dbRaw);
    
    let needsWrite = false;
    if (!dbData.downstream_port_channels) {
      dbData.downstream_port_channels = [];
      needsWrite = true;
    }
    if (!dbData.downstream_svis) {
      dbData.downstream_svis = [];
      needsWrite = true;
    }
    if (needsWrite) {
      fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2), 'utf8');
    }

    // Proactively sync files on load
    syncFiles(dbData);

    res.json(dbData);
  } catch (error) {
    console.error("Error fetching config database:", error);
    res.status(500).json({ error: "Failed to read database configurations." });
  }
});

// POST to save updated database configuration
app.post('/api/config', (req, res) => {
  try {
    ensureDirs();
    const updatedState = req.body;
    
    // Save to database
    fs.writeFileSync(DB_PATH, JSON.stringify(updatedState, null, 2), 'utf8');
    
    // Synchronize playbook files
    syncFiles(updatedState);

    res.json({ message: "Configurations saved and synchronized successfully." });
  } catch (error) {
    console.error("Error saving config database:", error);
    res.status(500).json({ error: "Failed to synchronize configurations." });
  }
});

// Stream Ansible deployment logs via Server-Sent Events (SSE)
app.get('/api/deploy', (req, res) => {
  const simulate = req.query.simulate === 'true';
  const features = (req.query.features || 'vpc,hsrp').split(',');

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendLog = (message, type = 'stdout') => {
    res.write(`data: ${JSON.stringify({ message, type })}\n\n`);
  };

  // 1. SIMULATOR DEPLOYMENT PIPELINE
  if (simulate) {
    sendLog("⚡ INITIATING LOCAL ANSIBLE SIMULATOR...", "system");
    sendLog(`Deploying modules: [${features.map(f => f.toUpperCase()).join(', ')}] with tag targets.\n`, "system");

    let dbData = getSeedData();
    try {
      if (fs.existsSync(DB_PATH)) {
        dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      }
    } catch (e) {
      console.error("Error reading db for simulation:", e);
    }

    const dev1 = dbData.devices[0]?.name || 'N9K-1';
    const dev2 = dbData.devices[1]?.name || 'N9K-2';

    const simulationLines = [];
    simulationLines.push({ delay: 100, text: "PLAY [Configure vPC and HSRP on Cisco Nexus Switches] ***************************" });
    simulationLines.push({ delay: 150, text: "" });
    simulationLines.push({ delay: 200, text: "TASK [0. Resolve Local Switch Configuration Details] ***************************" });
    simulationLines.push({ delay: 250, text: `ok: [${dev1}] => {"changed": false, "ansible_facts": {"local_device": {"role": "primary"}}}` });
    simulationLines.push({ delay: 200, text: `ok: [${dev2}] => {"changed": false, "ansible_facts": {"local_device": {"role": "secondary"}}}` });
    simulationLines.push({ delay: 100, text: "" });
    simulationLines.push({ delay: 300, text: "TASK [1. Enable Required Features] *********************************************" });
    simulationLines.push({ delay: 400, text: `changed: [${dev1}] => {"changed": true, "commands": ["feature vpc", "feature lacp", "feature interface-vlan", "feature hsrp"]}` });
    simulationLines.push({ delay: 300, text: `changed: [${dev2}] => {"changed": true, "commands": ["feature vpc", "feature lacp", "feature interface-vlan", "feature hsrp"]}` });

    // Stream vPC tasks only if selected
    if (features.includes('vpc')) {
      const domains = dbData.vpc_domains || [];
      domains.forEach(vpc => {
        const primaryDev = vpc.primary_switch;
        const secondaryDev = vpc.secondary_switch;
        
        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 200, text: `TASK [2. Configure vPC Domain and Keepalive on ${primaryDev}/${secondaryDev}] ***********************************` });
        simulationLines.push({ delay: 300, text: `changed: [${primaryDev}] => {"changed": true, "commands": ["vpc domain ${vpc.domain_id}", "peer-keepalive destination ${vpc.peer_keepalive.secondary_ip} source ${vpc.peer_keepalive.primary_ip} vrf management"]}` });
        simulationLines.push({ delay: 250, text: `changed: [${secondaryDev}] => {"changed": true, "commands": ["vpc domain ${vpc.domain_id}", "peer-keepalive destination ${vpc.peer_keepalive.primary_ip} source ${vpc.peer_keepalive.secondary_ip} vrf management"]}` });
        
        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 200, text: `TASK [3. Configure Physical Interfaces for Peer-Link on ${primaryDev}/${secondaryDev}] **************************` });
        if (vpc.peer_link && vpc.peer_link.interfaces) {
          vpc.peer_link.interfaces.forEach(intf => {
            simulationLines.push({ delay: 150, text: `changed: [${primaryDev}] => (item=${intf}) => {"changed": true}` });
            simulationLines.push({ delay: 150, text: `changed: [${secondaryDev}] => (item=${intf}) => {"changed": true}` });
          });
        }

        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 200, text: `TASK [4. Configure Port-Channel for Peer-Link on ${primaryDev}/${secondaryDev}] *********************************` });
        simulationLines.push({ delay: 300, text: `changed: [${primaryDev}] => {"changed": true, "commands": ["interface port-channel${vpc.peer_link.channel_group}", "vpc peer-link"]}` });
        simulationLines.push({ delay: 250, text: `changed: [${secondaryDev}] => {"changed": true, "commands": ["interface port-channel${vpc.peer_link.channel_group}", "vpc peer-link"]}` });

        if (vpc.downstream_connections && vpc.downstream_connections.length > 0) {
          simulationLines.push({ delay: 100, text: "" });
          simulationLines.push({ delay: 200, text: `TASK [5. Configure Physical Interfaces for Downstream Targets on ${primaryDev}/${secondaryDev}] *********` });
          vpc.downstream_connections.forEach(conn => {
            if (conn.primary_member_interfaces) {
              conn.primary_member_interfaces.forEach(intf => {
                simulationLines.push({ delay: 150, text: `changed: [${primaryDev}] => (item=${intf}) => {"changed": true}` });
              });
            }
            if (conn.secondary_member_interfaces) {
              conn.secondary_member_interfaces.forEach(intf => {
                simulationLines.push({ delay: 150, text: `changed: [${secondaryDev}] => (item=${intf}) => {"changed": true}` });
              });
            }
          });

          simulationLines.push({ delay: 100, text: "" });
          simulationLines.push({ delay: 200, text: `TASK [6. Configure Port-Channel for Downstream Targets on ${primaryDev}/${secondaryDev}] ****************` });
          vpc.downstream_connections.forEach(conn => {
            simulationLines.push({ delay: 300, text: `changed: [${primaryDev}] => {"changed": true, "commands": ["interface port-channel${conn.channel_group}", "vpc ${conn.vpc_id}"]}` });
            simulationLines.push({ delay: 250, text: `changed: [${secondaryDev}] => {"changed": true, "commands": ["interface port-channel${conn.channel_group}", "vpc ${conn.vpc_id}"]}` });
          });
        }
      });
    }

    // Stream HSRP/SVI tasks only if selected
    if (features.includes('hsrp')) {
      simulationLines.push({ delay: 100, text: "" });
      simulationLines.push({ delay: 200, text: "TASK [7. Create Layer 2 VLANs] *************************************************" });
      dbData.vlans.forEach(vlan => {
        let sw1 = "NXOS-1";
        let sw2 = "NXOS-2";
        const domain = dbData.vpc_domains?.find(d => d.domain_id === vlan.vpc_domain_id);
        if (domain) {
          sw1 = domain.primary_switch;
          sw2 = domain.secondary_switch;
        } else if (vlan.switch1) {
          sw1 = vlan.switch1;
          sw2 = vlan.switch2 || "";
        }
        
        simulationLines.push({ delay: 150, text: `changed: [${sw1}] => (item={'id': ${vlan.id}, 'name': '${vlan.name}'}) => {"changed": true}` });
        if (sw2) {
          simulationLines.push({ delay: 150, text: `changed: [${sw2}] => (item={'id': ${vlan.id}, 'name': '${vlan.name}'}) => {"changed": true}` });
        }
      });

      simulationLines.push({ delay: 100, text: "" });
      simulationLines.push({ delay: 200, text: "TASK [8. Configure SVI IP Addresses] *******************************************" });
      dbData.vlans.forEach(vlan => {
        let sw1 = "NXOS-1";
        let sw2 = "NXOS-2";
        const domain = dbData.vpc_domains?.find(d => d.domain_id === vlan.vpc_domain_id);
        if (domain) {
          sw1 = domain.primary_switch;
          sw2 = domain.secondary_switch;
        } else if (vlan.switch1) {
          sw1 = vlan.switch1;
          sw2 = vlan.switch2 || "";
        }
        
        simulationLines.push({ delay: 150, text: `changed: [${sw1}] => (item={'id': ${vlan.id}, 'name': '${vlan.name}'}) => {"changed": true, "commands": ["interface vlan ${vlan.id}", "ip address ${vlan.ip_switch1}/${vlan.mask}"]}` });
        if (sw2) {
          simulationLines.push({ delay: 150, text: `changed: [${sw2}] => (item={'id': ${vlan.id}, 'name': '${vlan.name}'}) => {"changed": true, "commands": ["interface vlan ${vlan.id}", "ip address ${vlan.ip_switch2}/${vlan.mask}"]}` });
        }
      });

      simulationLines.push({ delay: 100, text: "" });
      simulationLines.push({ delay: 200, text: "TASK [8.5 Configure HSRP Version 2 on SVIs] ************************************" });
      dbData.vlans.forEach(vlan => {
        let sw1 = "NXOS-1";
        let sw2 = "NXOS-2";
        const domain = dbData.vpc_domains?.find(d => d.domain_id === vlan.vpc_domain_id);
        if (domain) {
          sw1 = domain.primary_switch;
          sw2 = domain.secondary_switch;
        } else if (vlan.switch1) {
          sw1 = vlan.switch1;
          sw2 = vlan.switch2 || "";
        }
        
        simulationLines.push({ delay: 150, text: `changed: [${sw1}] => (item={'id': ${vlan.id}, 'name': '${vlan.name}'}) => {"changed": true, "commands": ["interface vlan ${vlan.id}", "hsrp version 2"]}` });
        if (sw2) {
          simulationLines.push({ delay: 150, text: `changed: [${sw2}] => (item={'id': ${vlan.id}, 'name': '${vlan.name}'}) => {"changed": true, "commands": ["interface vlan ${vlan.id}", "hsrp version 2"]}` });
        }
      });

      simulationLines.push({ delay: 100, text: "" });
      simulationLines.push({ delay: 200, text: "TASK [9. Configure HSRP Active / Standby Groups] *******************************" });
      dbData.vlans.forEach(vlan => {
        let sw1 = "NXOS-1";
        let sw2 = "NXOS-2";
        const domain = dbData.vpc_domains?.find(d => d.domain_id === vlan.vpc_domain_id);
        if (domain) {
          sw1 = domain.primary_switch;
          sw2 = domain.secondary_switch;
        } else if (vlan.switch1) {
          sw1 = vlan.switch1;
          sw2 = vlan.switch2 || "";
        }
        
        simulationLines.push({ delay: 150, text: `changed: [${sw1}] => (item={'id': ${vlan.id}, 'name': '${vlan.name}'}) => {"changed": true, "commands": ["interface vlan ${vlan.id}", "hsrp ${vlan.id}", "ip ${vlan.vip}", "priority ${vlan.hsrp_priority_switch1}", "preempt"]}` });
        if (sw2) {
          simulationLines.push({ delay: 150, text: `changed: [${sw2}] => (item={'id': ${vlan.id}, 'name': '${vlan.name}'}) => {"changed": true, "commands": ["interface vlan ${vlan.id}", "hsrp ${vlan.id}", "ip ${vlan.vip}", "priority ${vlan.hsrp_priority_switch2}"]}` });
        }
      });
    }

    simulationLines.push({ delay: 100, text: "" });
    simulationLines.push({ delay: 200, text: "TASK [10. Save the Running Configuration to Startup] ***************************" });
    simulationLines.push({ delay: 300, text: `changed: [${dev1}] => {"changed": true, "commands": ["copy running-config startup-config"]}` });
    simulationLines.push({ delay: 250, text: `changed: [${dev2}] => {"changed": true, "commands": ["copy running-config startup-config"]}` });

    // Stream downstream tasks in simulation
    const dsPortChannels = dbData.downstream_port_channels || [];
    const dsSvis = dbData.downstream_svis || [];

    if (dsPortChannels.length > 0 || dsSvis.length > 0) {
      simulationLines.push({ delay: 100, text: "" });
      simulationLines.push({ delay: 150, text: "PLAY [Configure Port-Channel and SVIs on Downstream IOS Switches] **************" });
      
      if (dsSvis.length > 0) {
        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 200, text: "TASK [Configure Layer 2 VLANs] *************************************************" });
        dsSvis.forEach(item => {
          simulationLines.push({ delay: 150, text: `changed: [${item.switch_name}] => (item={'id': ${item.vlan_id}, 'name': '${item.vlan_name}'}) => {"changed": true}` });
        });
      }

      if (dsPortChannels.length > 0) {
        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 200, text: "TASK [Configure Port-Channel Interface] *****************************************" });
        dsPortChannels.forEach(item => {
          simulationLines.push({ delay: 150, text: `changed: [${item.switch_name}] => (item={'id': ${item.port_channel_id}}) => {"changed": true, "commands": ["interface Port-channel${item.port_channel_id}", "switchport", "switchport trunk encapsulation dot1q", "switchport mode trunk", "no shutdown"]}` });
        });

        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 200, text: "TASK [Configure Physical Interfaces under Port-Channel] ************************" });
        dsPortChannels.forEach(item => {
          if (item.interfaces) {
            item.interfaces.forEach(intf => {
              simulationLines.push({ delay: 150, text: `changed: [${item.switch_name}] => (item=${intf}) => {"changed": true}` });
            });
          }
        });
      }

      if (dsSvis.length > 0) {
        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 200, text: "TASK [Configure Downstream SVIs] ***********************************************" });
        dsSvis.forEach(item => {
          simulationLines.push({ delay: 150, text: `changed: [${item.switch_name}] => (item={'id': ${item.vlan_id}}) => {"changed": true, "commands": ["interface Vlan${item.vlan_id}", "ip address ${item.ip_address} ${item.netmask}", "no shutdown"]}` });
        });
      }

      simulationLines.push({ delay: 100, text: "" });
      simulationLines.push({ delay: 200, text: "TASK [Save the Running Configuration on Downstream] ****************************" });
      const uniqueDsSwitches = [...new Set(dsPortChannels.concat(dsSvis).map(x => x.switch_name))];
      uniqueDsSwitches.forEach(sw => {
        simulationLines.push({ delay: 300, text: `changed: [${sw}] => {"changed": true}` });
      });

      simulationLines.push({ delay: 100, text: "" });
      simulationLines.push({ delay: 150, text: "PLAY RECAP *********************************************************************" });
      simulationLines.push({ delay: 100, text: `${dev1}                      : ok=11   changed=10   unreachable=0    failed=0    skipped=0    rescued=0    ignored=0` });
      simulationLines.push({ delay: 100, text: `${dev2}                      : ok=11   changed=10   unreachable=0    failed=0    skipped=0    rescued=0    ignored=0` });
      uniqueDsSwitches.forEach(sw => {
        simulationLines.push({ delay: 100, text: `${sw}                      : ok=6    changed=5    unreachable=0    failed=0    skipped=0    rescued=0    ignored=0` });
      });
      simulationLines.push({ delay: 200, text: "\n🏆 ANSIBLE DEPLOYMENT COMPLETED SUCCESSFULY!" });
    } else {
      simulationLines.push({ delay: 100, text: "" });
      simulationLines.push({ delay: 150, text: "PLAY RECAP *********************************************************************" });
      simulationLines.push({ delay: 100, text: `${dev1}                      : ok=11   changed=10   unreachable=0    failed=0    skipped=0    rescued=0    ignored=0` });
      simulationLines.push({ delay: 100, text: `${dev2}                      : ok=11   changed=10   unreachable=0    failed=0    skipped=0    rescued=0    ignored=0` });
      simulationLines.push({ delay: 200, text: "\n🏆 ANSIBLE DEPLOYMENT COMPLETED SUCCESSFULY!" });
    }

    let current = 0;
    const sendNext = () => {
      if (current < simulationLines.length) {
        const item = simulationLines[current];
        setTimeout(() => {
          sendLog(item.text, 'stdout');
          current++;
          sendNext();
        }, item.delay);
      } else {
        res.write('event: end\ndata: {"status": "success"}\n\n');
        res.end();
      }
    };
    sendNext();
    return;
  }

  // Fetch target connection variables from database
  if (!fs.existsSync(DB_PATH)) {
    sendLog("❌ ERROR: Database db.json not seeded. Please configure settings first.", "stderr");
    res.end();
    return;
  }
  const dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const srv = dbData.ansible_server;
  
  // Calculate dynamic tags to execute
  // If both selected: tag is 'all' (runs everything). If one selected: vpc or hsrp tag is passed.
  const tagsToRun = (features.includes('vpc') && features.includes('hsrp')) ? 'all' : features.join(',');

  // 2. REMOTE SSH DEPLOYMENT PIPELINE (The Global Enterprise Standard)
  if (srv.target === 'remote') {
    if (!Client) {
      try {
        Client = require('ssh2').Client;
      } catch (err) {
        sendLog("❌ ERROR: The Node.js 'ssh2' library is not fully installed or registered in the environment. Please run npm install ssh2.", "stderr");
        res.end();
        return;
      }
    }

    sendLog(`🚀 ESTABLISHING SECURE SSH TUNNEL TO REMOTE ANSIBLE CONTROLLER...`, "system");
    sendLog(`Target Controller: ${srv.username}@${srv.host}:${srv.port}\n`, "system");

    const conn = new Client();
    
    conn.on('ready', () => {
      sendLog("✅ SSH CONNECTION STABLISHED successfully. Preparing remote orchestration workspace...", "system");

      // Dynamic workspace path utilizing unique epoch timestamp for security
      const epoch = Date.now();
      const remoteWorkspace = `/tmp/fabric_orchestra_${epoch}`;
      sendLog(`Dynamic remote path: ${remoteWorkspace}\n`, "system");

      // Step A: Create remote execution bundle directory
      conn.exec(`mkdir -p ${remoteWorkspace}/vars`, (err, stream) => {
        if (err) {
          sendLog(`❌ FAILED to initialize remote workspace directory: ${err.message}`, "stderr");
          conn.end();
          res.end();
          return;
        }

        stream.resume();
        stream.on('close', (code) => {
          // Step B: Connect via SFTP to upload deployment bundle
          conn.sftp((err, sftp) => {
            if (err) {
              sendLog(`❌ FAILED to establish remote SFTP subsystem: ${err.message}`, "stderr");
              conn.end();
              res.end();
              return;
            }

            sendLog("📦 Bundling and uploading playbooks, vars, and inventories via SFTP...", "system");

            // Define dynamic files to upload
            const filesToUpload = [
              { local: path.join(__dirname, 'deploy_nexus.yml'), remote: `${remoteWorkspace}/deploy_nexus.yml` },
              { local: path.join(__dirname, 'inventory.ini'), remote: `${remoteWorkspace}/inventory.ini` },
              { local: path.join(__dirname, 'ansible.cfg'), remote: `${remoteWorkspace}/ansible.cfg` },
              { local: path.join(__dirname, 'vars', 'network_config.yml'), remote: `${remoteWorkspace}/vars/network_config.yml` }
            ];

            let uploadedCount = 0;
            const uploadNextFile = () => {
              if (uploadedCount < filesToUpload.length) {
                const file = filesToUpload[uploadedCount];
                try {
                  const localContent = fs.readFileSync(file.local, 'utf8');
                  const sanitizedContent = localContent.replace(/\r/g, '');
                  sftp.writeFile(file.remote, sanitizedContent, 'utf8', (err) => {
                    if (err) {
                      sendLog(`❌ SFTP upload failed for ${path.basename(file.local)}: ${err.message}`, "stderr");
                      conn.end();
                      res.end();
                      return;
                    }
                    uploadedCount++;
                    uploadNextFile();
                  });
                } catch (readErr) {
                  sendLog(`❌ Failed to read local file ${path.basename(file.local)}: ${readErr.message}`, "stderr");
                  conn.end();
                  res.end();
                  return;
                }
              } else {
                sendLog("✅ SFTP configuration bundle uploaded successfully.", "system");
                
                // Step C: Trigger Remote ansible-playbook execution in the temp folder
                const ansibleCmd = `cd ${remoteWorkspace} && ansible-playbook -i inventory.ini deploy_nexus.yml --tags "${tagsToRun}"`;
                sendLog(`Executing on remote server: ${ansibleCmd}\n`, "system");

                conn.exec(ansibleCmd, (err, exeStream) => {
                  if (err) {
                    sendLog(`❌ FAILED to initiate remote playbook process: ${err.message}`, "stderr");
                    conn.end();
                    res.end();
                    return;
                  }

                  exeStream.on('data', (data) => {
                    const lines = data.toString().split('\n');
                    lines.forEach(line => sendLog(line, 'stdout'));
                  });

                  exeStream.stderr.on('data', (data) => {
                    const lines = data.toString().split('\n');
                    lines.forEach(line => sendLog(line, 'stderr'));
                  });

                  exeStream.on('close', (code) => {
                    sendLog(`\n🏆 PLAYBOOK PROCESS FINISHED. Remote Exit Code: ${code}`, 'system');
                    
                    // Step D: Remote Workspace Clean-up to maintain system hygiene
                    sendLog(`🧹 Cleaning up remote temporary execution bundle...`, "system");
                    conn.exec(`rm -rf ${remoteWorkspace}`, (cleanErr, cleanStream) => {
                      if (cleanStream) {
                        cleanStream.resume();
                        cleanStream.on('close', () => {
                          conn.end();
                        });
                      } else {
                        conn.end();
                      }
                      
                      if (code === 0) {
                        res.write(`event: end\ndata: ${JSON.stringify({ status: 'success', code })}\n\n`);
                      } else {
                        res.write(`event: end\ndata: ${JSON.stringify({ status: 'failed', code })}\n\n`);
                      }
                      res.end();
                    });
                  });
                });
              }
            };

            uploadNextFile();
          });
        });
      });
    });

    conn.on('error', (err) => {
      sendLog(`❌ SSH CONNECTION ERROR to ${srv.host}: ${err.message}`, "stderr");
      res.write(`event: end\ndata: {"status": "failed"}\n\n`);
      res.end();
    });

    conn.connect({
      host: srv.host,
      port: srv.port,
      username: srv.username,
      password: srv.password,
      readyTimeout: 15000
    });

    req.on('close', () => {
      console.log('Client closed deployment stream, closing remote SSH tunnel...');
      conn.end();
    });

  } else {
    // 3. LOCAL ANSIBLE DEPLOYMENT PIPELINE
    sendLog("🚀 INITIATING LOCAL PRODUCTION DEPLOYMENT...", "system");
    sendLog(`Command: ansible-playbook -i inventory.ini deploy_nexus.yml --tags "${tagsToRun}"\n`, "system");

    const process = spawn('ansible-playbook', ['-i', 'inventory.ini', 'deploy_nexus.yml', '--tags', tagsToRun], {
      env: { ...process.env, PYTHONUNBUFFERED: '1', PAGER: 'cat' }
    });

    process.stdout.on('data', (data) => {
      const text = data.toString();
      const lines = text.split('\n');
      lines.forEach(line => sendLog(line, 'stdout'));
    });

    process.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => sendLog(line, 'stderr'));
    });

    process.on('close', (code) => {
      if (code === 0) {
        sendLog(`\n🏆 PLAYBOOK RUN COMPLETED SUCCESSFULLY WITH EXIT CODE ${code}`, 'system');
        res.write(`event: end\ndata: ${JSON.stringify({ status: 'success', code })}\n\n`);
      } else {
        sendLog(`\n❌ PLAYBOOK RUN FAILED WITH EXIT CODE ${code}`, 'stderr');
        res.write(`event: end\ndata: ${JSON.stringify({ status: 'failed', code })}\n\n`);
      }
      res.end();
    });

    req.on('close', () => {
      console.log('Client closed deployment stream, killing local subprocess...');
      process.kill();
    });
  }
});

app.listen(PORT, () => {
  console.log(`FabricOrchestra automation backend running at http://localhost:${PORT}`);
});
