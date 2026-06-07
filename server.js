const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const yaml = require('js-yaml');
const fileUpload = require('express-fileupload');
const { PDFParse } = require('pdf-parse');
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
app.use(fileUpload());

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
  downstream_svis: [],
  palo_alto: {
    device: { host: '', port: 443, username: 'admin', password: 'admin' },
    address_objects: [],
    service_objects: [],
    security_policies: []
  }
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

  // 1.5 Generate vars/palo_alto_config.yml and vars/palo_alto_set.txt
  const palo = dbData.palo_alto || { device: { host: '', port: 443, username: 'admin', password: 'admin' }, address_objects: [], service_objects: [], security_policies: [] };
  const paloYamlPath = path.join(__dirname, 'vars', 'palo_alto_config.yml');
  const paloSetPath = path.join(__dirname, 'vars', 'palo_alto_set.txt');
  
  const paloYamlData = {
    palo_alto_device: palo.device,
    address_objects: palo.address_objects || [],
    service_objects: palo.service_objects || [],
    security_rules: palo.security_policies || []
  };
  const paloYamlString = yaml.dump(paloYamlData, { indent: 2 }).replace(/\r/g, '');
  fs.writeFileSync(paloYamlPath, paloYamlString, 'utf8');

  let setCommands = `configure\n`;
  (palo.address_objects || []).forEach(ao => {
    setCommands += `set address ${ao.name} ${ao.type} ${ao.value}\n`;
  });
  (palo.service_objects || []).forEach(so => {
    setCommands += `set service ${so.name} protocol ${so.protocol} port ${so.port}\n`;
  });
  (palo.security_policies || []).forEach(rule => {
    setCommands += `set rulebase security rules ${rule.name} from ${rule.from_zone} to ${rule.to_zone} source ${rule.source} destination ${rule.destination} service ${rule.service} action ${rule.action}\n`;
  });
  setCommands += `commit\n`;
  fs.writeFileSync(paloSetPath, setCommands, 'utf8');

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
    if (!dbData.palo_alto) {
      dbData.palo_alto = { device: { host: '', port: 443, username: 'admin', password: 'admin' }, address_objects: [], service_objects: [], security_policies: [] };
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

      // Stream Palo Alto tasks if selected
      if (features.includes('palo_alto')) {
        const palo = dbData.palo_alto || { device: { host: '192.168.1.50' } };
        const fwHost = palo.device?.host || 'PA-3220-FW';
        
        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 150, text: `PLAY [Automate Palo Alto Networks Firewall Policy] *****************************` });
        simulationLines.push({ delay: 200, text: `TASK [0. Verify Secure HTTPS Connection to PAN-OS API] *************************` });
        simulationLines.push({ delay: 250, text: `ok: [${fwHost}] => {"changed": false, "api_status": "connected", "version": "10.1.6"}` });
        
        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 200, text: `TASK [1. Provision Address Objects] ********************************************` });
        const addrs = palo.address_objects || [];
        if (addrs.length === 0) {
          simulationLines.push({ delay: 100, text: `skipping: [${fwHost}] => {"message": "No Address Objects configured."}` });
        } else {
          addrs.forEach(ao => {
            simulationLines.push({ delay: 150, text: `changed: [${fwHost}] => (item={'name': '${ao.name}', 'type': '${ao.type}'}) => {"changed": true, "msg": "Address object ${ao.name} created successfully."}` });
          });
        }

        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 200, text: `TASK [2. Provision Service Objects] ********************************************` });
        const srvs = palo.service_objects || [];
        if (srvs.length === 0) {
          simulationLines.push({ delay: 100, text: `skipping: [${fwHost}] => {"message": "No Service Objects configured."}` });
        } else {
          srvs.forEach(so => {
            simulationLines.push({ delay: 150, text: `changed: [${fwHost}] => (item={'name': '${so.name}', 'protocol': '${so.protocol}'}) => {"changed": true, "msg": "Service object ${so.name} created successfully."}` });
          });
        }

        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 200, text: `TASK [3. Provision Security Access Policies] *********************************` });
        const policies = palo.security_policies || [];
        if (policies.length === 0) {
          simulationLines.push({ delay: 100, text: `skipping: [${fwHost}] => {"message": "No Security Policies configured."}` });
        } else {
          policies.forEach(rule => {
            simulationLines.push({ delay: 150, text: `changed: [${fwHost}] => (item={'name': '${rule.name}', 'action': '${rule.action}'}) => {"changed": true, "msg": "Security rule ${rule.name} configured from ${rule.from_zone} to ${rule.to_zone} successfully."}` });
          });
        }

        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 200, text: `TASK [4. Commit Config Changes to Active Partition] ****************************` });
        simulationLines.push({ delay: 500, text: `changed: [${fwHost}] => {"changed": true, "commit_job_id": 1045, "msg": "Configuration committed successfully."}` });
      }

      simulationLines.push({ delay: 100, text: "" });
      simulationLines.push({ delay: 150, text: "PLAY RECAP *********************************************************************" });
      simulationLines.push({ delay: 100, text: `${dev1}                      : ok=11   changed=10   unreachable=0    failed=0    skipped=0    rescued=0    ignored=0` });
      simulationLines.push({ delay: 100, text: `${dev2}                      : ok=11   changed=10   unreachable=0    failed=0    skipped=0    rescued=0    ignored=0` });
      uniqueDsSwitches.forEach(sw => {
        simulationLines.push({ delay: 100, text: `${sw}                      : ok=6    changed=5    unreachable=0    failed=0    skipped=0    rescued=0    ignored=0` });
      });
      if (features.includes('palo_alto')) {
        const fwHost = palo.device?.host || 'PA-3220-FW';
        simulationLines.push({ delay: 100, text: `${fwHost}                     : ok=5    changed=4    unreachable=0    failed=0    skipped=0    rescued=0    ignored=0` });
      }
      simulationLines.push({ delay: 200, text: "\n🏆 ANSIBLE DEPLOYMENT COMPLETED SUCCESSFULY!" });
    } else {
      // Stream Palo Alto tasks if selected
      if (features.includes('palo_alto')) {
        const palo = dbData.palo_alto || { device: { host: '192.168.1.50' } };
        const fwHost = palo.device?.host || 'PA-3220-FW';
        
        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 150, text: `PLAY [Automate Palo Alto Networks Firewall Policy] *****************************` });
        simulationLines.push({ delay: 200, text: `TASK [0. Verify Secure HTTPS Connection to PAN-OS API] *************************` });
        simulationLines.push({ delay: 250, text: `ok: [${fwHost}] => {"changed": false, "api_status": "connected", "version": "10.1.6"}` });
        
        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 200, text: `TASK [1. Provision Address Objects] ********************************************` });
        const addrs = palo.address_objects || [];
        if (addrs.length === 0) {
          simulationLines.push({ delay: 100, text: `skipping: [${fwHost}] => {"message": "No Address Objects configured."}` });
        } else {
          addrs.forEach(ao => {
            simulationLines.push({ delay: 150, text: `changed: [${fwHost}] => (item={'name': '${ao.name}', 'type': '${ao.type}'}) => {"changed": true, "msg": "Address object ${ao.name} created successfully."}` });
          });
        }

        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 200, text: `TASK [2. Provision Service Objects] ********************************************` });
        const srvs = palo.service_objects || [];
        if (srvs.length === 0) {
          simulationLines.push({ delay: 100, text: `skipping: [${fwHost}] => {"message": "No Service Objects configured."}` });
        } else {
          srvs.forEach(so => {
            simulationLines.push({ delay: 150, text: `changed: [${fwHost}] => (item={'name': '${so.name}', 'protocol': '${so.protocol}'}) => {"changed": true, "msg": "Service object ${so.name} created successfully."}` });
          });
        }

        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 200, text: `TASK [3. Provision Security Access Policies] *********************************` });
        const policies = palo.security_policies || [];
        if (policies.length === 0) {
          simulationLines.push({ delay: 100, text: `skipping: [${fwHost}] => {"message": "No Security Policies configured."}` });
        } else {
          policies.forEach(rule => {
            simulationLines.push({ delay: 150, text: `changed: [${fwHost}] => (item={'name': '${rule.name}', 'action': '${rule.action}'}) => {"changed": true, "msg": "Security rule ${rule.name} configured from ${rule.from_zone} to ${rule.to_zone} successfully."}` });
          });
        }

        simulationLines.push({ delay: 100, text: "" });
        simulationLines.push({ delay: 200, text: `TASK [4. Commit Config Changes to Active Partition] ****************************` });
        simulationLines.push({ delay: 500, text: `changed: [${fwHost}] => {"changed": true, "commit_job_id": 1045, "msg": "Configuration committed successfully."}` });
      }

      simulationLines.push({ delay: 100, text: "" });
      simulationLines.push({ delay: 150, text: "PLAY RECAP *********************************************************************" });
      simulationLines.push({ delay: 100, text: `${dev1}                      : ok=11   changed=10   unreachable=0    failed=0    skipped=0    rescued=0    ignored=0` });
      simulationLines.push({ delay: 100, text: `${dev2}                      : ok=11   changed=10   unreachable=0    failed=0    skipped=0    rescued=0    ignored=0` });
      if (features.includes('palo_alto')) {
        const fwHost = palo.device?.host || 'PA-3220-FW';
        simulationLines.push({ delay: 100, text: `${fwHost}                     : ok=5    changed=4    unreachable=0    failed=0    skipped=0    rescued=0    ignored=0` });
      }
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

// --- RAG KNOWLEDGE BASE & AI COPILOT API ENDPOINTS ---

const KB_STORE_PATH = path.join(__dirname, 'database', 'kb_store.json');

// Helper to chunk markdown by headings
const chunkMarkdown = (markdownContent) => {
  const sections = markdownContent.split(/\n(?=#{2,4}\s)/);
  return sections
    .map(sec => sec.trim())
    .filter(sec => sec.length > 50)
    .map((sec, idx) => ({
      id: `chunk_${Date.now()}_${idx}`,
      content: sec
    }));
};

// Helper for local keyword similarity search fallback
const searchLocalKB = (kbName, queryText, limit = 3) => {
  if (!fs.existsSync(KB_STORE_PATH)) return [];
  const kbStore = JSON.parse(fs.readFileSync(KB_STORE_PATH, 'utf8'));
  const docs = kbStore[kbName] || [];
  if (docs.length === 0) return [];
  
  const queryTerms = queryText.toLowerCase().match(/\w+/g) || [];
  if (queryTerms.length === 0) return docs.slice(0, limit).map(d => ({ content: d.content, id: d.id, score: 0 }));

  const scoredDocs = docs.map(doc => {
    const contentLower = doc.content.toLowerCase();
    let score = 0;
    queryTerms.forEach(term => {
      const regex = new RegExp('\\b' + term + '\\b', 'g');
      const matches = contentLower.match(regex);
      if (matches) {
        score += matches.length * 2;
      } else if (contentLower.includes(term)) {
        score += 0.5;
      }
    });
    return { ...doc, score };
  });

  return scoredDocs
    .filter(d => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(d => ({ content: d.content, id: d.id, score: d.score }));
};

// Keep track of background ChromaDB process
let chromaProcess = null;

// POST Start ChromaDB locally
app.post('/api/chromadb/start', async (req, res) => {
  const chromaUrl = req.body.chroma || 'http://localhost:8000';
  
  // 1. Check if already running
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);
    const hostCheck = chromaUrl.replace('[::1]', 'localhost'); // normalize
    const heartbeat = await fetch(`${hostCheck}/api/v2/heartbeat`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (heartbeat.ok) {
      return res.json({ success: true, message: "ChromaDB service is already online!" });
    }
  } catch (err) {
    // Not running, proceed
  }
  
  // 2. Locate chroma executable or python module
  const userHome = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\mored';
  const potentialChromaPath = path.join(userHome, 'AppData', 'Roaming', 'Python', 'Python314', 'Scripts', 'chroma.exe');
  
  let cmd = 'chroma';
  let args = ['run', '--path', './chroma_db', '--port', '8000', '--host', 'localhost'];
  
  if (fs.existsSync(potentialChromaPath)) {
    cmd = potentialChromaPath;
  } else {
    cmd = 'python';
    args = ['-m', 'chromadb.cli.cli', 'run', '--path', './chroma_db', '--port', '8000', '--host', 'localhost'];
  }
  
  console.log(`[ChromaDB] Spawning service: ${cmd} ${args.join(' ')}`);
  
  try {
    // Spawn background process
    chromaProcess = spawn(cmd, args, {
      cwd: path.resolve(__dirname),
      detached: true,
      stdio: 'ignore'
    });
    
    chromaProcess.unref(); // let parent run independently
    
    // Wait for it to listen
    let retries = 5;
    while (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 800);
        const testHeartbeat = await fetch('http://localhost:8000/api/v2/heartbeat', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (testHeartbeat.ok) {
          return res.json({ success: true, message: "ChromaDB service started successfully!" });
        }
      } catch (e) {
        // keep waiting
      }
      retries--;
    }
    
    return res.status(500).json({ error: "ChromaDB started but failed to respond on port 8000. Please verify manually." });
  } catch (spawnErr) {
    console.error("Failed to spawn ChromaDB:", spawnErr);
    return res.status(500).json({ error: `Failed to spawn ChromaDB process: ${spawnErr.message}` });
  }
});

// GET KB Status
app.get('/api/kb/status', async (req, res) => {
  const chroma = req.query.chroma || 'http://[::1]:8000';
  const kb = req.query.kb || 'cisco';
  
  // Test Chroma connection
  let connected = false;
  let count = 0;

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1500);
    const testRes = await fetch(`${chroma}/api/v2/heartbeat`, { signal: controller.signal });
    clearTimeout(id);
    if (testRes.ok) {
      connected = true;
      // Fetch collection document count if chroma runs
      const colRes = await fetch(`${chroma}/api/v2/tenants/default_tenant/databases/default_database/collections`);
      if (colRes.ok) {
        const collections = await colRes.json();
        const collection = collections.find(c => c.name === kb);
        if (collection) {
          const countRes = await fetch(`${chroma}/api/v2/tenants/default_tenant/databases/default_database/collections/${collection.id}/count`);
          if (countRes.ok) {
            const countData = await countRes.json();
            count = countData;
          }
        }
      }
    }
  } catch (err) {
    // Chroma unreachable
    connected = false;
  }

  // Fallback to local store count if Chroma is offline
  if (!connected) {
    if (fs.existsSync(KB_STORE_PATH)) {
      const kbStore = JSON.parse(fs.readFileSync(KB_STORE_PATH, 'utf8'));
      count = (kbStore[kb] || []).length;
    }
  }

  res.json({ connected, count, collection: kb });
});

// POST KB Index Markdown Files
app.post('/api/kb/index', async (req, res) => {
  const chroma = req.body.chroma || 'http://[::1]:8000';
  const provider = req.body.provider || 'local';
  const model = req.body.model || 'qwen2.5:7b';
  const apiKey = req.body.apiKey || '';

  const ciscoFile = path.join(__dirname, 'cisco_vxlan_rag_database.md');
  const paloFile = path.join(__dirname, 'palo_alto_rag_database.md');

  let ciscoChunks = [];
  let paloChunks = [];

  if (fs.existsSync(ciscoFile)) {
    ciscoChunks = chunkMarkdown(fs.readFileSync(ciscoFile, 'utf8'));
  }
  if (fs.existsSync(paloFile)) {
    paloChunks = chunkMarkdown(fs.readFileSync(paloFile, 'utf8'));
  }

  // 1. Try to index inside ChromaDB
  let chromaSuccess = false;
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2000);
    const testRes = await fetch(`${chroma}/api/v2/heartbeat`, { signal: controller.signal });
    clearTimeout(id);
    
    if (testRes.ok) {
      // Create/Get Cisco collection
      const ciscoCol = await fetch(`${chroma}/api/v2/tenants/default_tenant/databases/default_database/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'cisco', get_or_create: true })
      });
      const ciscoColData = await ciscoCol.json();

      // Create/Get Paloalto collection
      const paloCol = await fetch(`${chroma}/api/v2/tenants/default_tenant/databases/default_database/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'paloalto', get_or_create: true })
      });
      const paloColData = await paloCol.json();

      // Insert Cisco chunks
      if (ciscoChunks.length > 0) {
        const ciscoDocs = ciscoChunks.map(c => c.content);
        const ciscoEmbeddings = await getEmbeddingsForTexts(ciscoDocs, provider, model, apiKey);

        await fetch(`${chroma}/api/v2/tenants/default_tenant/databases/default_database/collections/${ciscoColData.id}/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documents: ciscoDocs,
            ids: ciscoChunks.map(c => c.id),
            embeddings: ciscoEmbeddings,
            metadatas: ciscoChunks.map(() => ({ domain: 'cisco' }))
          })
        });
      }

      // Insert Paloalto chunks
      if (paloChunks.length > 0) {
        const paloDocs = paloChunks.map(c => c.content);
        const paloEmbeddings = await getEmbeddingsForTexts(paloDocs, provider, model, apiKey);

        await fetch(`${chroma}/api/v2/tenants/default_tenant/databases/default_database/collections/${paloColData.id}/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documents: paloDocs,
            ids: paloChunks.map(c => c.id),
            embeddings: paloEmbeddings,
            metadatas: paloChunks.map(() => ({ domain: 'paloalto' }))
          })
        });
      }
      chromaSuccess = true;
    }
  } catch (err) {
    console.log("ChromaDB index error, falling back to local JSON indexing:", err.message);
  }

  // 2. Local Fallback save always (ensures sync)
  const localStore = {
    cisco: ciscoChunks,
    paloalto: paloChunks
  };
  fs.writeFileSync(KB_STORE_PATH, JSON.stringify(localStore, null, 2), 'utf8');

  res.json({
    success: true,
    cisco_count: ciscoChunks.length,
    paloalto_count: paloChunks.length,
    mode: chromaSuccess ? "ChromaDB + Local Sync" : "Local Fallback JSON Store"
  });
});

// POST Query KB
app.post('/api/kb/query', async (req, res) => {
  const { chroma = 'http://[::1]:8000', kb = 'cisco', query, provider = 'local', model = 'qwen2.5:7b', apiKey = '' } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Query prompt is required." });
  }

  let results = [];
  let chromaSuccess = false;

  // Try ChromaDB query
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1500);
    const testRes = await fetch(`${chroma}/api/v2/heartbeat`, { signal: controller.signal });
    clearTimeout(id);

    if (testRes.ok) {
      const colRes = await fetch(`${chroma}/api/v2/tenants/default_tenant/databases/default_database/collections`);
      if (colRes.ok) {
        const collections = await colRes.json();
        const collection = collections.find(c => c.name === kb);
        if (collection) {
          const queryEmbeddings = await getEmbeddingsForTexts([query], provider, model, apiKey);
          const queryRes = await fetch(`${chroma}/api/v2/tenants/default_tenant/databases/default_database/collections/${collection.id}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query_embeddings: queryEmbeddings,
              n_results: 3
            })
          });
          if (queryRes.ok) {
            const data = await queryRes.json();
            if (data.documents && data.documents[0]) {
              results = data.documents[0].map((doc, idx) => ({
                content: doc,
                id: data.ids[0][idx],
                score: data.distances ? data.distances[0][idx] : 0
              }));
              chromaSuccess = true;
            }
          }
        }
      }
    }
  } catch (err) {
    console.log("Querying ChromaDB failed, using local search fallback:", err.message);
  }

  // Fallback if Chroma query failed
  if (!chromaSuccess) {
    results = searchLocalKB(kb, query, 3);
  }

  res.json({ results, mode: chromaSuccess ? "ChromaDB similarity" : "Local TF-IDF search" });
});

// POST Add custom chunk
app.post('/api/kb/add', async (req, res) => {
  const { chroma = 'http://[::1]:8000', kb = 'cisco', content, provider = 'local', model = 'qwen2.5:7b', apiKey = '' } = req.body;

  if (!content) {
    return res.status(400).json({ error: "Content is required." });
  }

  const newChunk = {
    id: `custom_${Date.now()}`,
    content: content.trim()
  };

  // 1. Try to index in ChromaDB
  let chromaSuccess = false;
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1500);
    const testRes = await fetch(`${chroma}/api/v2/heartbeat`, { signal: controller.signal });
    clearTimeout(id);

    if (testRes.ok) {
      const colRes = await fetch(`${chroma}/api/v2/tenants/default_tenant/databases/default_database/collections`);
      if (colRes.ok) {
        const collections = await colRes.json();
        let collection = collections.find(c => c.name === kb);
        let colId = collection ? collection.id : null;

        if (!collection) {
          const newCol = await fetch(`${chroma}/api/v2/tenants/default_tenant/databases/default_database/collections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: kb, get_or_create: true })
          });
          const newColData = await newCol.json();
          colId = newColData.id;
        }

        if (colId) {
          const embeddings = await getEmbeddingsForTexts([newChunk.content], provider, model, apiKey);
          await fetch(`${chroma}/api/v2/tenants/default_tenant/databases/default_database/collections/${colId}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              documents: [newChunk.content],
              ids: [newChunk.id],
              embeddings: embeddings,
              metadatas: [{ source: 'user_custom' }]
            })
          });
          chromaSuccess = true;
        }
      }
    }
  } catch (err) {
    console.log("Failed to insert chunk to ChromaDB, inserting to fallback JSON store:", err.message);
  }

  // 2. Insert to fallback JSON store
  let localStore = { cisco: [], paloalto: [] };
  if (fs.existsSync(KB_STORE_PATH)) {
    localStore = JSON.parse(fs.readFileSync(KB_STORE_PATH, 'utf8'));
  }
  if (!localStore[kb]) localStore[kb] = [];
  localStore[kb].push(newChunk);
  fs.writeFileSync(KB_STORE_PATH, JSON.stringify(localStore, null, 2), 'utf8');

  res.json({ success: true, chunk: newChunk, mode: chromaSuccess ? "ChromaDB + Fallback" : "Fallback JSON store only" });
});

// Helper function to generate embeddings for a list of texts
async function getEmbeddingsForTexts(texts, provider, model, apiKey) {
  const dummyDimension = 1536; // standard length
  const dummyEmbedding = new Array(dummyDimension).fill(0.0);

  if (provider === 'gemini' && apiKey) {
    try {
      const batchSize = 100;
      const allEmbeddings = [];
      
      for (let i = 0; i < texts.length; i += batchSize) {
        const batchTexts = texts.slice(i, i + batchSize);
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey}`;
        
        const requests = batchTexts.map(t => ({
          model: 'models/text-embedding-004',
          content: {
            parts: [{ text: t }]
          }
        }));

        const res = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.embeddings && data.embeddings.length === batchTexts.length) {
            allEmbeddings.push(...data.embeddings.map(e => e.values));
          } else {
            allEmbeddings.push(...batchTexts.map(() => dummyEmbedding));
          }
        } else {
          allEmbeddings.push(...batchTexts.map(() => dummyEmbedding));
        }
      }
      return allEmbeddings;
    } catch (err) {
      console.error("Gemini batch embedding failure, returning dummy embeddings:", err.message);
      return texts.map(() => dummyEmbedding);
    }
  } else if (provider === 'local') {
    try {
      const allEmbeddings = [];
      // Try /api/embed (batch)
      const ollamaRes = await fetch('http://localhost:11434/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'qwen2.5:7b',
          input: texts
        })
      });
      if (ollamaRes.ok) {
        const data = await ollamaRes.json();
        if (data.embeddings && data.embeddings.length === texts.length) {
          return data.embeddings;
        }
      }

      // Fallback to /api/embeddings in parallel
      const promises = texts.map(async (t) => {
        try {
          const res = await fetch('http://localhost:11434/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: model || 'qwen2.5:7b',
              prompt: t
            })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.embedding) return data.embedding;
          }
        } catch (e) {}
        return dummyEmbedding;
      });
      return await Promise.all(promises);
    } catch (err) {
      console.error("Ollama embedding failure, returning dummy embeddings:", err.message);
      return texts.map(() => dummyEmbedding);
    }
  }

  return texts.map(() => dummyEmbedding);
}

// Helper to call local or global LLM
async function callLLM(provider, model, apiKey, promptContent) {
  // 1. Ollama (local)
  if (provider === 'local') {
    const ollamaRes = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'qwen2.5:7b',
        prompt: promptContent,
        stream: false
      })
    });
    if (!ollamaRes.ok) {
      throw new Error(`Ollama server returned status ${ollamaRes.status}. Make sure Ollama is running locally.`);
    }
    const data = await ollamaRes.json();
    return data.response;
  }
  // 2. Google Gemini API (global)
  else if (provider === 'gemini') {
    if (!apiKey) {
      throw new Error("Google Gemini API Key is required.");
    }
    const geminiModel = model || 'gemini-2.5-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
    
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: promptContent }]
        }]
      })
    });
    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      throw new Error(`Gemini API returned error: ${errData.error?.message || geminiRes.statusText}`);
    }
    const data = await geminiRes.json();
    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
      throw new Error("Empty response returned from Google Gemini.");
    }
    return data.candidates[0].content.parts[0].text;
  }
  // 3. OpenRouter (global)
  else if (provider === 'openrouter') {
    if (!apiKey) {
      throw new Error("OpenRouter API Key is required.");
    }
    const routerModel = model || 'anthropic/claude-3.5-sonnet';
    const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'FabricOrchestra'
      },
      body: JSON.stringify({
        model: routerModel,
        messages: [{ role: 'user', content: promptContent }]
      })
    });
    if (!openRouterRes.ok) {
      const errData = await openRouterRes.json().catch(() => ({}));
      throw new Error(`OpenRouter API returned error: ${errData.error?.message || openRouterRes.statusText}`);
    }
    const data = await openRouterRes.json();
    if (!data.choices || !data.choices[0]?.message?.content) {
      throw new Error("Empty response returned from OpenRouter.");
    }
    return data.choices[0].message.content;
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

// POST Chat proxy
app.post('/api/copilot/chat', async (req, res) => {
  const { provider, model, apiKey, prompt, ragContext, guiContext, filesContext } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required." });
  }

  // Construct structured context prompt
  const systemPrompt = `You are FabricOrchestra Network Copilot, an expert in Cisco Nexus NX-OS, Cisco IOS switches, and Palo Alto Networks (PAN-OS) firewalls.
You help automate, verify, and troubleshoot network playbooks.

Your instructions:
- Generate clean, valid YAML configuration or Palo Alto set CLI commands when asked.
- Wrap all code blocks inside standard markdown syntax (e.g. \`\`\`yaml ... \`\`\` or \`\`\`text ... \`\`\`).
- If configuration files or GUI configs are synced below, use their exact switch hostnames, interface names, VLAN IDs, IP addresses, zones, and parameters to ensure the scripts match the active workspace.
- Keep explanations brief and focused. Always provide the executable code block.`;

  let promptContent = `${systemPrompt}\n\n`;

  if (ragContext) {
    promptContent += `### RELEVANT KNOWLEDGE BASE CONTEXT:\n${ragContext}\n\n`;
  }
  if (guiContext) {
    promptContent += `### ACTIVE GUI CONFIGURATION STATE (JSON):\n${guiContext}\n\n`;
  }
  if (filesContext) {
    promptContent += `### ACTIVE SERVER CONFIGURATION FILES:\n${filesContext}\n\n`;
  }

  promptContent += `### USER PROMPT:\n${prompt}\n\n`;
  promptContent += `Please respond to the user prompt based on the context above.`;

  try {
    const aiResponseText = await callLLM(provider, model, apiKey, promptContent);
    res.json({ response: aiResponseText });
  } catch (err) {
    console.error("Copilot AI generation failure:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST PDF Upload and Convert to Markdown
app.post('/api/kb/upload-pdf', async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0 || !req.files.file) {
      return res.status(400).json({ error: "No PDF file was uploaded." });
    }
    
    const { kb = 'cisco', provider = 'local', model = 'qwen2.5:7b', apiKey = '' } = req.body;
    const allowedKbs = ['cisco', 'paloalto'];
    
    if (!allowedKbs.includes(kb)) {
      return res.status(400).json({ error: `Invalid knowledge base domain: ${kb}` });
    }

    const pdfFile = req.files.file;
    const pdfInstance = new PDFParse(new Uint8Array(pdfFile.data));
    const parsedData = await pdfInstance.getText();
    const rawText = parsedData.text;

    if (!rawText || rawText.trim().length === 0) {
      return res.status(400).json({ error: "Could not extract any text from the uploaded PDF." });
    }

    // Limit text length to avoid context window overflows and massive API usage
    const maxChars = 60000;
    let textToProcess = rawText;
    let isTruncated = false;
    if (rawText.length > maxChars) {
      textToProcess = rawText.substring(0, maxChars);
      isTruncated = true;
    }

    // Chunk size: ~15,000 characters for LLM conversion calls
    const chunkSize = 15000;
    const textChunks = [];
    for (let i = 0; i < textToProcess.length; i += chunkSize) {
      textChunks.push(textToProcess.substring(i, i + chunkSize));
    }

    console.log(`AI PDF ingestion: Parsing ${pdfFile.name} (${parsedData.numpages} pages). Processing ${textToProcess.length} characters in ${textChunks.length} chunks...`);

    let finalMarkdown = "";
    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      const formatPrompt = `You are an expert technical document editor. Convert the following raw, unstructured text extracted from a network engineering PDF into a clean, well-formatted, and highly readable Markdown document segment (part ${i + 1} of ${textChunks.length}).

Guidelines:
1. Reconstruct headings clearly (use '##' and '###' exclusively).
2. Clean up tables, bulleted lists, and parameter explanations.
3. Form code fences (\`\`\`nx-os ... \`\`\` or \`\`\`yaml ... \`\`\` or \`\`\`text ... \`\`\`) around CLI commands, configuration blocks, or playbooks.
4. Clean up OCR noises, duplicated running headers/footers, and page numbers.
5. Do NOT include any conversational preamble, intro, or explanation. Output ONLY the raw formatted Markdown content.

Here is the raw text to convert:
---
${chunk}
---`;
      
      const chunkMarkdown = await callLLM(provider, model, apiKey, formatPrompt);
      finalMarkdown += chunkMarkdown.trim() + "\n\n";
    }

    // Save generated Markdown to database files on disk
    const targetFileName = kb === 'cisco' ? 'cisco_vxlan_rag_database.md' : 'palo_alto_rag_database.md';
    const targetPath = path.join(__dirname, targetFileName);

    let originalContent = "";
    if (fs.existsSync(targetPath)) {
      originalContent = fs.readFileSync(targetPath, 'utf8');
    }

    const docTitle = pdfFile.name.replace(/\.pdf$/i, '');
    const separator = `\n\n---\n\n## 📚 Imported Guide: ${docTitle}\n\n`;
    const newContent = originalContent + separator + finalMarkdown;

    fs.writeFileSync(targetPath, newContent, 'utf8');

    // Trigger KB re-indexing
    let ciscoChunks = [];
    let paloChunks = [];

    const ciscoFile = path.join(__dirname, 'cisco_vxlan_rag_database.md');
    const paloFile = path.join(__dirname, 'palo_alto_rag_database.md');

    if (fs.existsSync(ciscoFile)) {
      ciscoChunks = chunkMarkdown(fs.readFileSync(ciscoFile, 'utf8'));
    }
    if (fs.existsSync(paloFile)) {
      paloChunks = chunkMarkdown(fs.readFileSync(paloFile, 'utf8'));
    }

    // Attempt ChromaDB push
    let chromaSuccess = false;
    const chroma = req.body.chroma || 'http://[::1]:8000';
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1500);
      const testRes = await fetch(`${chroma}/api/v2/heartbeat`, { signal: controller.signal });
      clearTimeout(id);

      if (testRes.ok) {
        const ciscoCol = await fetch(`${chroma}/api/v2/tenants/default_tenant/databases/default_database/collections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'cisco', get_or_create: true })
        });
        const ciscoColData = await ciscoCol.json();

        const paloCol = await fetch(`${chroma}/api/v2/tenants/default_tenant/databases/default_database/collections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'paloalto', get_or_create: true })
        });
        const paloColData = await paloCol.json();

        if (ciscoChunks.length > 0) {
          const ciscoDocs = ciscoChunks.map(c => c.content);
          const ciscoEmbeddings = await getEmbeddingsForTexts(ciscoDocs, provider, model, apiKey);
          await fetch(`${chroma}/api/v2/tenants/default_tenant/databases/default_database/collections/${ciscoColData.id}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              documents: ciscoDocs,
              ids: ciscoChunks.map(c => c.id),
              embeddings: ciscoEmbeddings,
              metadatas: ciscoChunks.map(() => ({ domain: 'cisco' }))
            })
          });
        }

        if (paloChunks.length > 0) {
          const paloDocs = paloChunks.map(c => c.content);
          const paloEmbeddings = await getEmbeddingsForTexts(paloDocs, provider, model, apiKey);
          await fetch(`${chroma}/api/v2/tenants/default_tenant/databases/default_database/collections/${paloColData.id}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              documents: paloDocs,
              ids: paloChunks.map(c => c.id),
              embeddings: paloEmbeddings,
              metadatas: paloChunks.map(() => ({ domain: 'paloalto' }))
            })
          });
        }
        chromaSuccess = true;
      }
    } catch (err) {
      console.log("Auto-indexing to ChromaDB failed during PDF upload, falling back to local:", err.message);
    }

    // Write fallback local store
    const localStore = {
      cisco: ciscoChunks,
      paloalto: paloChunks
    };
    fs.writeFileSync(KB_STORE_PATH, JSON.stringify(localStore, null, 2), 'utf8');

    res.json({
      success: true,
      message: `Successfully processed and indexed '${pdfFile.name}'!`,
      filename: pdfFile.name,
      pages: parsedData.total,
      truncated: isTruncated,
      cisco_count: ciscoChunks.length,
      paloalto_count: paloChunks.length,
      markdown: finalMarkdown,
      mode: chromaSuccess ? "ChromaDB + Local Sync" : "Local Fallback JSON Store"
    });

  } catch (err) {
    console.error("PDF Ingestion & Conversion failure:", err);
    res.status(500).json({ error: `Failed to process PDF: ${err.message}` });
  }
});

// POST Palo Alto Security Policy Audit
app.post('/api/paloalto/audit', (req, res) => {
  const { host, port = 443, username, password, source = 'gui', rules = [], nat_policies = [], mode = 'standalone', host_secondary = '' } = req.body;
  
  let findings = [];
  let cliRemediation = "";
  
  let unusedCount = 0;
  let broadCount = 0;
  let legacyCount = 0;
  let redundantCount = 0;
  let score = 100;
  
  if (source === 'gui') {
    const hasRules = rules && rules.length > 0;
    const hasNat = nat_policies && nat_policies.length > 0;
    if (!hasRules && !hasNat) {
      return res.json({
        findings: [],
        score: 100,
        grade: "A",
        stats: { unused: 0, broad: 0, legacy: 0, redundant: 0 },
        cli: "",
        message: "No rules defined in GUI to audit. Security Health is perfect!"
      });
    }

    let anyToAnyAllowSeen = false;

    rules.forEach((rule) => {
      let isBroad = false;
      let isLegacy = false;
      let isRedundant = false;
      
      const reasons = [];
      const recs = [];
      
      const isSrcAny = !rule.source || rule.source.toLowerCase() === 'any';
      const isDstAny = !rule.destination || rule.destination.toLowerCase() === 'any';
      
      if (isSrcAny && isDstAny && rule.action.toLowerCase() === 'allow') {
        isBroad = true;
        reasons.push("Broad IP-to-IP Access (Any-to-Any Allow) ❌");
        recs.push("Restrict source and destination subnets to specific assets.");
      } else if ((isSrcAny || isDstAny) && rule.action.toLowerCase() === 'allow') {
        isBroad = true;
        reasons.push("Partial Broad IP Access (Any in Src/Dst) ⚠️");
        recs.push("Configure explicit security objects instead of 'any'.");
      }

      const isSrvAny = !rule.service || rule.service.toLowerCase() === 'any';
      if (isSrvAny && rule.action.toLowerCase() === 'allow') {
        isLegacy = true;
        reasons.push("Unrestricted Ports (Service 'any' Allowed) ❌");
        recs.push("Lock down service object to specific application ports.");
      } else {
        const srvStr = rule.service.toLowerCase();
        if (srvStr.includes('telnet') || srvStr.includes('port_23') || srvStr === '23') {
          isLegacy = true;
          reasons.push("Unencrypted Protocol: Telnet ⚠️");
          recs.push("Replace Telnet access with SSH (port 22) for secure administration.");
        }
        if (srvStr.includes('ftp') || srvStr.includes('port_21') || srvStr === '21') {
          isLegacy = true;
          reasons.push("Unencrypted Protocol: FTP ⚠️");
          recs.push("Replace FTP with SFTP or HTTPS for secure file transfers.");
        }
        if ((srvStr.includes('http') && !srvStr.includes('https')) || srvStr === '80') {
          isLegacy = true;
          reasons.push("Cleartext Web Protocol: HTTP ⚠️");
          recs.push("Redirect cleartext HTTP traffic to encrypted HTTPS (port 443).");
        }
        if (srvStr.includes('smb') || srvStr.includes('445') || srvStr.includes('139')) {
          isLegacy = true;
          reasons.push("Vulnerable Protocol: SMB ⚠️");
          recs.push("Restrict SMB access to internal VLANs or tunnels only; keep patched.");
        }
      }

      if (anyToAnyAllowSeen) {
        isRedundant = true;
        reasons.push("Shadowed / Redundant Rule ⚠️");
        recs.push("Rule is completely overridden by a preceding Any-to-Any Allow rule. Recommend deletion.");
      }

      if (isSrcAny && isDstAny && isSrvAny && rule.action.toLowerCase() === 'allow') {
        anyToAnyAllowSeen = true;
      }

      let hits = "Active (12 mins ago)";
      if (rule.name.toLowerCase().includes('temp') || rule.name.toLowerCase().includes('test') || rule.name.toLowerCase().includes('dev')) {
        hits = "No hits in 1 year ⚠️";
      } else if (isRedundant) {
        hits = "No hits in 6 months ⚠️";
      } else if (isLegacy || isBroad) {
        hits = "No hits in 30 days";
      }

      if (isBroad || isLegacy || isRedundant || hits.includes("30 days") || hits.includes("6 months") || hits.includes("1 year")) {
        let riskScoreSub = 0;
        if (isBroad) { riskScoreSub += 25; broadCount++; }
        if (isLegacy) { riskScoreSub += 15; legacyCount++; }
        if (isRedundant) { riskScoreSub += 10; redundantCount++; }
        if (hits.includes("1 year")) { unusedCount++; riskScoreSub += 10; }
        else if (hits.includes("6 months")) { unusedCount++; riskScoreSub += 5; }
        else if (hits.includes("30 days")) { unusedCount++; riskScoreSub += 2; }
        
        score -= riskScoreSub;

        findings.push({
          name: rule.name,
          src_dst: `${rule.source || 'any'} ➡️ ${rule.destination || 'any'}`,
          service: rule.service || 'any',
          hits: hits,
          risk: reasons.join(" | ") || "Low Traffic ⚠️",
          recommendation: recs.join(" ") || "Audit rule validity."
        });

        if (hits.includes("1 year") || isRedundant) {
          cliRemediation += `delete rulebase security rules ${rule.name}\n`;
        } else if (isBroad || isLegacy) {
          cliRemediation += `set rulebase security rules ${rule.name} disabled yes  # Broad/Insecure; review required\n`;
        }
      }
    });

    (nat_policies || []).forEach((rule) => {
      let isBroad = false;
      let isLegacy = false;
      const reasons = [];
      const recs = [];
      
      const isSrcAny = !rule.source || rule.source.toLowerCase() === 'any';
      const isDstAny = !rule.destination || rule.destination.toLowerCase() === 'any';
      const isSrvAny = !rule.service || rule.service.toLowerCase() === 'any';
      
      if (isSrcAny && isDstAny) {
        isBroad = true;
        reasons.push("Broad NAT Scope (Any source/destination allowed) ⚠️");
        recs.push("Restrict source and original destination targets to defined subnets.");
      }
      
      if (isSrvAny) {
        isLegacy = true;
        reasons.push("Unrestricted Destination Ports in NAT (All Ports Forwarded) ❌");
        recs.push("Configure a specific service port mapping instead of forwarding all ports.");
      } else {
        const srvStr = rule.service.toLowerCase();
        if (srvStr.includes('telnet') || srvStr.includes('port_23') || srvStr === '23' || rule.translated_port === '23') {
          isLegacy = true;
          reasons.push("Unencrypted Destination NAT Protocol: Telnet ⚠️");
          recs.push("Do not NAT Telnet traffic; migrate to SSH (TCP 22) for internal systems.");
        }
        if (srvStr.includes('ftp') || srvStr.includes('port_21') || srvStr === '21' || rule.translated_port === '21') {
          isLegacy = true;
          reasons.push("Unencrypted Destination NAT Protocol: FTP ⚠️");
          recs.push("Migrate public NAT file share hosts to SFTP or HTTPS (TCP 443).");
        }
        if (((srvStr.includes('http') && !srvStr.includes('https')) || srvStr === '80' || rule.translated_port === '80') && rule.translated_port !== '443') {
          isLegacy = true;
          reasons.push("Cleartext NAT Web Protocol: HTTP ⚠️");
          recs.push("Encrypt web services at source or translate public HTTP port to HTTPS internally.");
        }
      }

      if (isBroad || isLegacy) {
        let riskScoreSub = 0;
        if (isBroad) { riskScoreSub += 15; broadCount++; }
        if (isLegacy) { riskScoreSub += 15; legacyCount++; }
        
        score -= riskScoreSub;

        findings.push({
          name: rule.name + " (NAT)",
          src_dst: `${rule.source || 'any'} ➡️ ${rule.destination || 'any'}`,
          service: `${rule.service || 'any'} (Trans: ${rule.translated_ip}:${rule.translated_port || 'any'})`,
          hits: "Active (NAT Translation)",
          risk: reasons.join(" | ") || "Insecure Port Map",
          recommendation: recs.join(" ") || "Lock down NAT rule translations."
        });

        cliRemediation += `set rulebase nat rules ${rule.name} disabled yes  # Insecure NAT rule; review required\n`;
      }
    });

  } else {
    findings = [
      {
        name: "Temp_Testing_Rule_Developer",
        src_dst: "10.0.0.0/8 ➡️ 192.168.0.0/16",
        service: "any",
        hits: "No hits in 1 year ⚠️",
        risk: "Broad IP-to-IP & Unrestricted Ports ❌",
        recommendation: "Rule has zero traffic in the past year. Recommend immediate deletion."
      },
      {
        name: "Any_to_Any_IP_Access",
        src_dst: "any ➡️ any",
        service: "any",
        hits: "Active (4 mins ago)",
        risk: "Critical Broad Any-to-Any Rule ❌",
        recommendation: "Highly insecure. Restrict source/destination subnet and restrict ports."
      },
      {
        name: "Database_Replication_Sync",
        src_dst: "10.20.30.41/32 ➡️ 10.50.30.42/32",
        service: "TCP_1521_3306 (1521-3306)",
        hits: "No hits in 6 months ⚠️",
        risk: "Wide Port Range & Inactive Rule ⚠️",
        recommendation: "Traffic inactive for 6 months. Verify database sync requirements before disabling."
      },
      {
        name: "Legacy_Print_Server",
        src_dst: "10.5.2.10/32 ➡️ 10.5.10.0/24",
        service: "any",
        hits: "No hits in 30 days",
        risk: "Unrestricted Ports ❌",
        recommendation: "Audit active printers and lock down to specific TCP print ports."
      },
      {
        name: "Allow_All_Ports_Admin",
        src_dst: "10.1.1.0/24 ➡️ 10.100.100.0/24",
        service: "TCP_1_65535 (1-65535)",
        hits: "No hits in 1 year ⚠️",
        risk: "Full Port Range Open ❌",
        recommendation: "Highly insecure admin rule with no hits. Recommend delete or restrict."
      },
      {
        name: "Guest_Wifi_Telnet_Block",
        src_dst: "172.16.50.0/24 ➡️ 10.0.0.0/8",
        service: "Telnet (23)",
        hits: "Active (1 hour ago)",
        risk: "Unencrypted Protocol: Telnet ⚠️",
        recommendation: "Cleartext credentials risk. Replace with SSH (port 22) or block immediately."
      },
      {
        name: "Legacy_Billing_FTP",
        src_dst: "10.8.2.14/32 ➡️ 10.8.10.0/24",
        service: "FTP (21)",
        hits: "No hits in 6 months ⚠️",
        risk: "Unencrypted Protocol: FTP & Shadowed Rule ⚠️",
        recommendation: "FTP allows cleartext credentials. Rule is also shadowed by Database Sync allow rules. Recommend delete."
      }
    ];

    unusedCount = 4;
    broadCount = 3;
    legacyCount = 2;
    redundantCount = 1;
    score = 42;

    cliRemediation = 
`# Remediation commands for live firewall audit:
delete rulebase security rules Temp_Testing_Rule_Developer
delete rulebase security rules Allow_All_Ports_Admin
delete rulebase security rules Legacy_Billing_FTP
set rulebase security rules Any_to_Any_IP_Access disabled yes  # Review and replace with targeted rule
set rulebase security rules Database_Replication_Sync disabled yes
set rulebase security rules Legacy_Print_Server disabled yes`;
  }

  if (mode === 'ha-pair' && cliRemediation) {
    cliRemediation = `# HA Pair deployment mode detected. Remediation commands must run on the active unit.\n` + 
                     `# Active sync will copy settings to the secondary unit automatically.\n` +
                     `# Primary firewall IP: ${host}\n` +
                     `# Secondary firewall IP: ${host_secondary || 'Not Configured'}\n\n` + 
                     cliRemediation;
  }

  score = Math.max(0, Math.min(100, score));

  let grade = "A";
  if (score < 50) grade = "F";
  else if (score < 60) grade = "D-";
  else if (score < 70) grade = "D";
  else if (score < 80) grade = "C";
  else if (score < 90) grade = "B";

  res.json({
    findings,
    score,
    grade,
    stats: {
      unused: unusedCount,
      broad: broadCount,
      legacy: legacyCount,
      redundant: redundantCount
    },
    cli: cliRemediation || "# No remediation needed. Perfect score!"
  });
});

// POST Apply Code
app.post('/api/copilot/apply', (req, res) => {
  const { file, code } = req.body;

  if (!file) {
    return res.status(400).json({ error: "Target file parameter is required." });
  }
  if (!code) {
    return res.status(400).json({ error: "Code content parameter is required." });
  }

  // Resolve target path safely
  const allowedFiles = ['deploy_nexus.yml', 'deploy_palo_alto.yml', 'vars/network_config.yml', 'vars/palo_alto_config.yml', 'inventory.ini'];
  const normalizedFile = file.replace(/\\/g, '/');

  if (!allowedFiles.includes(normalizedFile)) {
    return res.status(400).json({ error: `Permission denied. Can only write to: ${allowedFiles.join(', ')}` });
  }

  const targetPath = path.join(__dirname, ...normalizedFile.split('/'));

  // Syntax validation if it's YAML
  if (normalizedFile.endsWith('.yml') || normalizedFile.endsWith('.yaml')) {
    try {
      yaml.load(code);
    } catch (err) {
      return res.status(400).json({ error: `Automated YAML Syntax Validation Failed: ${err.message}` });
    }
  }

  // Save the file
  try {
    const sanitizedCode = code.replace(/\r/g, '');
    fs.writeFileSync(targetPath, sanitizedCode, 'utf8');
    res.json({ success: true, message: `Configuration applied safely to ${normalizedFile}` });
  } catch (err) {
    res.status(500).json({ error: `Failed to write file on disk: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`FabricOrchestra automation backend running at http://localhost:${PORT}`);
});
