/* ==========================================================================
   FABRICORCHESTRA AUTOMATION CONTROL CENTER - JAVASCRIPT
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // --- STATE ---
  let state = {
    credentials: { username: 'admin', password: 'admin' },
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
      { id: 20, name: "VOICE", vpc_domain_id: 10, vip: "10.10.20.254", mask: "24", ip_switch1: "10.10.20.252", ip_switch2: "10.10.20.253", hsrp_priority_switch1: 150, hsrp_priority_switch2: 120 }
    ]
  };

  let deploymentEventSource = null;

  // --- ELEMENT SELECTORS ---
  const elBtnOpenSettings = document.getElementById('btnOpenSettings');
  const elBtnCloseDrawer = document.getElementById('btnCloseDrawer');
  const elSettingsDrawer = document.getElementById('settingsDrawer');
  const elDrawerOverlay = document.getElementById('drawerOverlay');

  const elUsername = document.getElementById('username');
  const elPassword = document.getElementById('password');
  
  const elAnsibleTarget = document.getElementById('ansibleTarget');
  const elRemoteAnsibleContainer = document.getElementById('remoteAnsibleContainer');
  const elAnsibleHost = document.getElementById('ansibleHost');
  const elAnsiblePort = document.getElementById('ansiblePort');
  const elAnsibleUser = document.getElementById('ansibleUser');
  const elAnsiblePass = document.getElementById('ansiblePass');
  const elAnsibleWorkDir = document.getElementById('ansibleWorkDir');

  const elSwitchGrid = document.getElementById('switchGrid');
  const elNodeName = document.getElementById('nodeName');
  const elNodeIp = document.getElementById('nodeIp');
  const elNodeRole = document.getElementById('nodeRole');
  const elBtnAddNode = document.getElementById('btnAddNode');

  const elBtnCreateVpcDomain = document.getElementById('btnCreateVpcDomain');
  const elVpcDomainsContainer = document.getElementById('vpcDomainsContainer');

  const elVlanId = document.getElementById('vlanId');
  const elVlanName = document.getElementById('vlanName');
  const elVlanVip = document.getElementById('vlanVip');
  const elVlanMask = document.getElementById('vlanMask');
  const elVlanHostType = document.getElementById('vlanHostType');
  const elVlanHostVpcRow = document.getElementById('vlanHostVpcRow');
  const elVlanHostStandaloneRow = document.getElementById('vlanHostStandaloneRow');
  
  const elVlanVpcDomainSelect = document.getElementById('vlanVpcDomainSelect');
  const elVlanVpcIp1 = document.getElementById('vlanVpcIp1');
  const elVlanVpcIp2 = document.getElementById('vlanVpcIp2');

  const elVlanSw1Select = document.getElementById('vlanSw1Select');
  const elVlanSw1Ip = document.getElementById('vlanSw1Ip');
  const elVlanSw2Select = document.getElementById('vlanSw2Select');
  const elVlanSw2Ip = document.getElementById('vlanSw2Ip');

  const elHsrpVpcPairIndicator = document.getElementById('hsrpVpcPairIndicator');
  const elVlanPri1 = document.getElementById('vlanPri1');
  const elVlanPri2 = document.getElementById('vlanPri2');
  const elBtnAddVlan = document.getElementById('btnAddVlan');
  const elVlanTableBody = document.getElementById('vlanTableBody');

  const elYamlContent = document.getElementById('yamlContent');
  const elIniContent = document.getElementById('iniContent');
  
  const elTerminal = document.getElementById('terminalOutput');
  const elBtnClearTerminal = document.getElementById('btnClearTerminal');
  const elAutoScroll = document.getElementById('autoScroll');
  const elBtnSaveConfig = document.getElementById('btnSaveConfig');
  const elBtnDeploy = document.getElementById('btnDeploy');
  const elBtnVerify = document.getElementById('btnVerify');
  const elSimMode = document.getElementById('simulationMode');
  
  const elDeployVpcBox = document.getElementById('deployVpcBox');
  const elDeployHsrpBox = document.getElementById('deployHsrpBox');

  const elDsPcSwitchSelect = document.getElementById('dsPcSwitchSelect');
  const elDsPcId = document.getElementById('dsPcId');
  const elDsPcInterfaces = document.getElementById('dsPcInterfaces');
  const elBtnAddDsPc = document.getElementById('btnAddDsPc');
  const elDsPcTableBody = document.getElementById('dsPcTableBody');

  const elDsSviSwitchSelect = document.getElementById('dsSviSwitchSelect');
  const elDsSviVlanId = document.getElementById('dsSviVlanId');
  const elDsSviVlanName = document.getElementById('dsSviVlanName');
  const elDsSviIp = document.getElementById('dsSviIp');
  const elDsSviNetmask = document.getElementById('dsSviNetmask');
  const elBtnAddDsSvi = document.getElementById('btnAddDsSvi');
  const elDsSviTableBody = document.getElementById('dsSviTableBody');

  // --- NAVIGATION TAB CONTROLLER ---
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      const targetTabId = tab.getAttribute('data-tab');
      document.getElementById(targetTabId).classList.add('active');
    });
  });

  // --- SETTINGS DRAWER TOGGLE CONTROLLER ---
  if (elBtnOpenSettings && elBtnCloseDrawer && elSettingsDrawer && elDrawerOverlay) {
    elBtnOpenSettings.addEventListener('click', () => {
      elSettingsDrawer.classList.add('open');
      elDrawerOverlay.style.display = 'block';
    });

    const closeDrawer = () => {
      elSettingsDrawer.classList.remove('open');
      elDrawerOverlay.style.display = 'none';
    };
    elBtnCloseDrawer.addEventListener('click', closeDrawer);
    elDrawerOverlay.addEventListener('click', closeDrawer);
  }

  // --- PERSISTENT CODE PREVIEW TABS ---
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.code-tab').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const targetView = btn.getAttribute('data-target');
      document.getElementById(targetView).classList.add('active');
    });
  });

  // --- ANSIBLE ENGINE LOCATION SELECTOR ---
  elAnsibleTarget.addEventListener('change', () => {
    if (elAnsibleTarget.value === 'remote') {
      elRemoteAnsibleContainer.style.display = 'block';
    } else {
      elRemoteAnsibleContainer.style.display = 'none';
    }
    syncInputsToState();
    updateConfigPreviews();
  });

  // --- HSRP GATEWAY PLACEMENT HOST TOGGLE ---
  elVlanHostType.addEventListener('change', () => {
    if (elVlanHostType.value === 'vpc') {
      elVlanHostVpcRow.style.display = 'flex';
      elVlanHostStandaloneRow.style.display = 'none';
    } else {
      elVlanHostVpcRow.style.display = 'none';
      elVlanHostStandaloneRow.style.display = 'flex';
      checkVpcPairStandaloneSelection();
    }
  });

  // Standalone Selection Detect vPC Pair Event Listeners
  elVlanSw1Select.addEventListener('change', checkVpcPairStandaloneSelection);
  elVlanSw2Select.addEventListener('change', checkVpcPairStandaloneSelection);

  function checkVpcPairStandaloneSelection() {
    const sw1 = elVlanSw1Select.value;
    const sw2 = elVlanSw2Select.value;
    
    if (!sw1 || !sw2 || sw1 === sw2) {
      elHsrpVpcPairIndicator.style.display = 'none';
      return;
    }

    // Search if these two are a vPC domain primary/secondary pair
    const isVpcPair = (state.vpc_domains || []).some(d => 
      (d.primary_switch === sw1 && d.secondary_switch === sw2) ||
      (d.primary_switch === sw2 && d.secondary_switch === sw1)
    );

    if (isVpcPair) {
      elHsrpVpcPairIndicator.style.display = 'inline-flex';
      elHsrpVpcPairIndicator.textContent = "⚡ Auto-Detected: Selected switches belong to a vPC Domain Pair! Config will support vPC features.";
      elHsrpVpcPairIndicator.className = "vpc-pair-badge";
    } else {
      elHsrpVpcPairIndicator.style.display = 'none';
    }
  }

  // --- DYNAMIC INPUT SYNCHRONIZATION ---
  const globalInputsToTrack = [
    elUsername, elPassword,
    elAnsibleTarget, elAnsibleHost, elAnsiblePort, elAnsibleUser, elAnsiblePass, elAnsibleWorkDir
  ];

  globalInputsToTrack.forEach(el => {
    el.addEventListener('change', () => {
      syncInputsToState();
      updateConfigPreviews();
    });
    el.addEventListener('input', () => {
      syncInputsToState();
      updateConfigPreviews();
    });
  });

  function syncInputsToState() {
    state.credentials.username = elUsername.value.trim();
    state.credentials.password = elPassword.value;

    state.ansible_server = {
      target: elAnsibleTarget.value,
      host: elAnsibleHost.value.trim(),
      port: parseInt(elAnsiblePort.value) || 22,
      username: elAnsibleUser.value.trim(),
      password: elAnsiblePass.value,
      workspace: elAnsibleWorkDir.value.trim()
    };
  }

  function syncStateToInputs() {
    elUsername.value = state.credentials.username;
    elPassword.value = state.credentials.password;

    const srv = state.ansible_server;
    elAnsibleTarget.value = srv.target;
    elAnsibleHost.value = srv.host;
    elAnsiblePort.value = srv.port;
    elAnsibleUser.value = srv.username;
    elAnsiblePass.value = srv.password;
    elAnsibleWorkDir.value = srv.workspace;

    if (srv.target === 'remote') {
      elRemoteAnsibleContainer.style.display = 'block';
    } else {
      elRemoteAnsibleContainer.style.display = 'none';
    }
  }

  // --- DYNAMIC SWITCH GRID WITH CATEGORIES ---
  function renderSwitchGrid() {
    elSwitchGrid.innerHTML = '';
    
    if (state.devices.length === 0) {
      elSwitchGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); font-style: italic; padding: 1.5rem;">
          No switches configured in directory. Use form below to add nodes.
        </div>`;
      return;
    }

    const leafs = state.devices.filter(d => d.role?.includes('leaf') || d.role?.includes('primary') || d.role?.includes('secondary'));
    const spines = state.devices.filter(d => d.role?.includes('spine'));
    const downstreams = state.devices.filter(d => d.role?.includes('downstream'));
    const generics = state.devices.filter(d => !d.role || (!d.role.includes('leaf') && !d.role.includes('spine') && !d.role.includes('downstream')));

    const sections = [
      { title: "🍂 Leaf Switches", list: leafs },
      { title: "🏛️ Spine Switches", list: spines },
      { title: "🔌 Downstream Targets", list: downstreams },
      { title: "🖥️ Standalone Devices", list: generics }
    ];

    sections.forEach(sec => {
      if (sec.list.length > 0) {
        const titleDiv = document.createElement('div');
        titleDiv.className = 'inventory-section-title';
        titleDiv.style.gridColumn = '1 / -1';
        titleDiv.innerHTML = `${sec.title} <span>${sec.list.length}</span>`;
        elSwitchGrid.appendChild(titleDiv);

        sec.list.forEach(d => {
          const card = document.createElement('div');
          card.className = 'switch-card';
          
          let roleLabel = d.role || "Generic";
          if (roleLabel === 'leaf-primary') roleLabel = 'Leaf (Primary)';
          if (roleLabel === 'leaf-secondary') roleLabel = 'Leaf (Secondary)';
          if (roleLabel === 'spine') roleLabel = 'Spine';
          if (roleLabel === 'downstream') roleLabel = 'Downstream Switch';

          card.innerHTML = `
            <div class="switch-card-header">
              <div class="switch-title-wrap">
                <span class="status-indicator online"></span>
                <span class="switch-name">${d.name}</span>
              </div>
              <span style="font-size: 0.7rem; background: rgba(56, 189, 248, 0.1); padding: 0.2rem 0.4rem; border-radius: 4px; color: var(--primary); font-weight: 600;">${roleLabel}</span>
            </div>
            <div class="switch-card-body">
              <div class="switch-card-info">Management IP: <strong>${d.ip}</strong></div>
            </div>
            <button type="button" class="switch-delete-btn" data-id="${d.id}" style="position: absolute; top: 10px; right: 10px;" title="Delete Switch">✕</button>
          `;
          elSwitchGrid.appendChild(card);
        });
      }
    });

    // Add delete click handlers
    document.querySelectorAll('.switch-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        state.devices = state.devices.filter(d => d.id !== id);
        
        populateVpcSelectors();
        renderSwitchGrid();
        renderVpcDomains();
        populateVlanVpcDomainSelect();
        populateStandaloneSwitchSelects();
        populateDownstreamSwitchSelects();
        updateConfigPreviews();
      });
    });
  }

  // --- ADD SWITCH INVENTORY NODE ---
  elBtnAddNode.addEventListener('click', () => {
    const name = elNodeName.value.trim().toUpperCase();
    const ip = elNodeIp.value.trim();
    const role = elNodeRole.value;

    if (!name) {
      alert("Please enter a Switch Hostname.");
      return;
    }
    if (!ip || !isValidIp(ip)) {
      alert("Please enter a valid switch Management IP address.");
      return;
    }

    const newId = Date.now().toString();
    state.devices.push({
      id: newId,
      name, ip, role
    });

    elNodeName.value = '';
    elNodeIp.value = '';

    populateVpcSelectors();
    renderSwitchGrid();
    renderVpcDomains();
    populateVlanVpcDomainSelect();
    populateStandaloneSwitchSelects();
    populateDownstreamSwitchSelects();
    updateConfigPreviews();
  });

  // --- MULTI-DOMAIN vPC RENDER CONTROLLER ---
  function renderVpcDomains() {
    if (!elVpcDomainsContainer) return;
    elVpcDomainsContainer.innerHTML = '';

    const domains = state.vpc_domains || [];

    if (domains.length === 0) {
      elVpcDomainsContainer.innerHTML = `
        <div class="card" style="text-align: center; color: var(--text-muted); font-style: italic; padding: 2.5rem; background: var(--bg-card); border: 1px solid var(--border-color);">
          No active vPC Domain Pairs registered. Click "+ Create Domain Pair" at the top right to initialize a domain pair.
        </div>`;
      return;
    }

    domains.forEach((vpc, domainIdx) => {
      const card = document.createElement('div');
      card.className = 'card vpc-domain-card';

      // Load dynamic list of Leafs
      const leafs = state.devices.filter(d => d.role?.includes('leaf') || d.role?.includes('primary') || d.role?.includes('secondary'));
      
      const primaryOptions = leafs.map(d => `<option value="${d.name}" ${vpc.primary_switch === d.name ? 'selected' : ''}>${d.name} (${d.ip})</option>`).join('');
      const secondaryOptions = leafs.map(d => `<option value="${d.name}" ${vpc.secondary_switch === d.name ? 'selected' : ''}>${d.name} (${d.ip})</option>`).join('');

      let linksHtml = '';
      if (vpc.downstream_connections && vpc.downstream_connections.length > 0) {
        vpc.downstream_connections.forEach((conn, connIdx) => {
          linksHtml += `
            <div class="downstream-connection-row">
              <div class="downstream-row-header">
                <span class="downstream-row-title">🔗 Downstream Connection ${connIdx + 1}: ${conn.target_device_name || 'Generic Device'}</span>
                <button type="button" class="btn-delete-link" data-domain-idx="${domainIdx}" data-conn-idx="${connIdx}">✕ Remove Link</button>
              </div>
              <div class="form-row">
                <div class="form-group col-4">
                  <label>Target Switch Name</label>
                  <input type="text" class="input-target-device" data-domain-idx="${domainIdx}" data-conn-idx="${connIdx}" value="${conn.target_device_name || ''}" placeholder="e.g. SW-L3">
                </div>
                <div class="form-group col-4">
                  <label>Port-Channel ID</label>
                  <input type="number" class="input-channel-group" data-domain-idx="${domainIdx}" data-conn-idx="${connIdx}" value="${conn.channel_group || 100}" min="1" max="4096">
                </div>
                <div class="form-group col-4">
                  <label>vPC ID</label>
                  <input type="number" class="input-vpc-id" data-domain-idx="${domainIdx}" data-conn-idx="${connIdx}" value="${conn.vpc_id || 100}" min="1" max="4096">
                </div>
              </div>
              <div class="form-row mt-3">
                <div class="form-group col-6">
                  <label>${vpc.primary_switch || 'NXOS-1'} Physical Ports (Comma Separated)</label>
                  <input type="text" class="input-primary-intfs" data-domain-idx="${domainIdx}" data-conn-idx="${connIdx}" value="${(conn.primary_member_interfaces || []).join(', ')}" placeholder="e.g. Ethernet1/3">
                </div>
                <div class="form-group col-6">
                  <label>${vpc.secondary_switch || 'NXOS-2'} Physical Ports (Comma Separated)</label>
                  <input type="text" class="input-secondary-intfs" data-domain-idx="${domainIdx}" data-conn-idx="${connIdx}" value="${(conn.secondary_member_interfaces || []).join(', ')}" placeholder="e.g. Ethernet1/3">
                </div>
              </div>
            </div>`;
        });
      } else {
        linksHtml = `
          <div style="text-align: center; color: var(--text-muted); font-size: 0.82rem; font-style: italic; padding: 1.5rem 0;">
            No active downstream vPC links configured for this domain. Click "+ Add Downstream Link" to configure connections.
          </div>`;
      }

      card.innerHTML = `
        <div class="card-header space-between" style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.75rem;">
          <div class="flex-align">
            <div class="card-icon">🍃</div>
            <h2>vPC Domain: ${vpc.domain_id} &mdash; ${vpc.name || 'Leaf-Pair'}</h2>
          </div>
          <button type="button" class="btn btn-danger btn-delete-domain" data-domain-idx="${domainIdx}" style="background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.25); color: var(--danger); font-size: 0.75rem; font-weight: 600; padding: 0.35rem 0.75rem;">✕ Delete Domain Pair</button>
        </div>
        <div class="card-body">
          <div class="form-row">
            <div class="form-group col-3">
              <label>Domain Name</label>
              <input type="text" class="input-domain-name" data-domain-idx="${domainIdx}" value="${vpc.name || ''}" placeholder="e.g. Leaf-Pair-Pod1">
            </div>
            <div class="form-group col-3">
              <label>vPC Domain ID</label>
              <input type="number" class="input-domain-id" data-domain-idx="${domainIdx}" value="${vpc.domain_id || 10}" min="1" max="1000">
            </div>
            <div class="form-group col-3">
              <label>Primary Leaf Switch</label>
              <select class="custom-select select-primary-switch" data-domain-idx="${domainIdx}">
                ${primaryOptions}
              </select>
            </div>
            <div class="form-group col-3">
              <label>Secondary Leaf Switch</label>
              <select class="custom-select select-secondary-switch" data-domain-idx="${domainIdx}">
                ${secondaryOptions}
              </select>
            </div>
          </div>

          <div class="divider" style="margin: 1.5rem 0;"></div>

          <h3 class="section-title" style="font-size: 0.88rem; color: var(--primary); margin-bottom: 1rem;">🔌 Keepalive & Peer-Link Configuration</h3>
          <div class="form-row">
            <div class="form-group col-3">
              <label>Peer-Link Port-Channel ID</label>
              <input type="number" class="input-peer-channel" data-domain-idx="${domainIdx}" value="${vpc.peer_link?.channel_group || 10}" min="1" max="4096">
            </div>
            <div class="form-group col-3">
              <label>Peer-Link Interfaces (Comma Separated)</label>
              <input type="text" class="input-peer-interfaces" data-domain-idx="${domainIdx}" value="${(vpc.peer_link?.interfaces || []).join(', ')}" placeholder="e.g. Ethernet1/1, Ethernet1/2">
            </div>
            <div class="form-group col-3">
              <label>${vpc.primary_switch || 'NXOS-1'} Keepalive IP</label>
              <input type="text" class="input-keepalive-primary" data-domain-idx="${domainIdx}" value="${vpc.peer_keepalive?.primary_ip || ''}" placeholder="e.g. 192.168.1.19">
            </div>
            <div class="form-group col-3">
              <label>${vpc.secondary_switch || 'NXOS-2'} Keepalive IP</label>
              <input type="text" class="input-keepalive-secondary" data-domain-idx="${domainIdx}" value="${vpc.peer_keepalive?.secondary_ip || ''}" placeholder="e.g. 192.168.1.13">
            </div>
          </div>

          <div class="divider" style="margin: 1.5rem 0;"></div>

          <div class="space-between align-center" style="margin-bottom: 1rem;">
            <h3 class="section-title" style="font-size: 0.88rem; color: var(--success); margin: 0;">🧬 Multiple Downstream vPC Channels</h3>
            <button type="button" class="btn btn-secondary btn-add-link" data-domain-idx="${domainIdx}" style="padding: 0.25rem 0.75rem; font-size: 0.75rem;">+ Add Downstream Link</button>
          </div>

          <div class="downstream-links-container">
            ${linksHtml}
          </div>
        </div>`;
      elVpcDomainsContainer.appendChild(card);
    });

    bindVpcDomainEvents();
  }

  // Bind Dynamic Events for vPC cards
  function bindVpcDomainEvents() {
    // Delete Domain
    document.querySelectorAll('.btn-delete-domain').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-domain-idx'));
        const deletedDomainId = state.vpc_domains[idx]?.domain_id;
        state.vpc_domains.splice(idx, 1);

        // Cascade nullify deleted domain mappings
        if (deletedDomainId) {
          state.vlans.forEach(v => {
            if (v.vpc_domain_id === deletedDomainId) {
              v.vpc_domain_id = null;
            }
          });
        }

        renderVpcDomains();
        populateVlanVpcDomainSelect();
        renderVlanTable();
        updateConfigPreviews();
      });
    });

    // Create Downstream connection link
    document.querySelectorAll('.btn-add-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-domain-idx'));
        if (!state.vpc_domains[idx].downstream_connections) {
          state.vpc_domains[idx].downstream_connections = [];
        }
        state.vpc_domains[idx].downstream_connections.push({
          id: 'link-' + Date.now(),
          target_device_name: '',
          channel_group: 100,
          vpc_id: 100,
          primary_member_interfaces: ['Ethernet1/3'],
          secondary_member_interfaces: ['Ethernet1/3']
        });
        renderVpcDomains();
        updateConfigPreviews();
      });
    });

    // Delete Downstream connection link
    document.querySelectorAll('.btn-delete-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const dIdx = parseInt(btn.getAttribute('data-domain-idx'));
        const cIdx = parseInt(btn.getAttribute('data-conn-idx'));
        state.vpc_domains[dIdx].downstream_connections.splice(cIdx, 1);
        renderVpcDomains();
        updateConfigPreviews();
      });
    });

    // Dynamically bind changes to state
    const bindInputs = (selector, handler) => {
      document.querySelectorAll(selector).forEach(el => {
        const updateAll = (eventEl) => {
          const dIdx = parseInt(eventEl.getAttribute('data-domain-idx'));
          const cIdx = parseInt(eventEl.getAttribute('data-conn-idx'));
          handler(eventEl, dIdx, cIdx);
          populateVlanVpcDomainSelect();
          renderVlanTable();
          updateConfigPreviews();
        };
        el.addEventListener('change', () => updateAll(el));
        el.addEventListener('input', () => updateAll(el));
      });
    };

    bindInputs('.input-domain-name', (el, dIdx) => { state.vpc_domains[dIdx].name = el.value.trim(); });
    bindInputs('.input-domain-id', (el, dIdx) => {
      const oldId = state.vpc_domains[dIdx].domain_id;
      const newId = parseInt(el.value) || 10;
      if (oldId !== newId) {
        state.vpc_domains[dIdx].domain_id = newId;
        // Cascade update mapped VLANs
        state.vlans.forEach(v => {
          if (v.vpc_domain_id === oldId) {
            v.vpc_domain_id = newId;
          }
        });
      }
    });
    bindInputs('.select-primary-switch', (el, dIdx) => { state.vpc_domains[dIdx].primary_switch = el.value; });
    bindInputs('.select-secondary-switch', (el, dIdx) => { state.vpc_domains[dIdx].secondary_switch = el.value; });
    bindInputs('.input-peer-channel', (el, dIdx) => { state.vpc_domains[dIdx].peer_link.channel_group = parseInt(el.value) || 10; });
    bindInputs('.input-peer-interfaces', (el, dIdx) => { state.vpc_domains[dIdx].peer_link.interfaces = el.value.split(',').map(s => s.trim()).filter(Boolean); });
    bindInputs('.input-keepalive-primary', (el, dIdx) => { state.vpc_domains[dIdx].peer_keepalive.primary_ip = el.value.trim(); });
    bindInputs('.input-keepalive-secondary', (el, dIdx) => { state.vpc_domains[dIdx].peer_keepalive.secondary_ip = el.value.trim(); });

    bindInputs('.input-target-device', (el, dIdx, cIdx) => { state.vpc_domains[dIdx].downstream_connections[cIdx].target_device_name = el.value.trim(); });
    bindInputs('.input-channel-group', (el, dIdx, cIdx) => { state.vpc_domains[dIdx].downstream_connections[cIdx].channel_group = parseInt(el.value) || 100; });
    bindInputs('.input-vpc-id', (el, dIdx, cIdx) => { state.vpc_domains[dIdx].downstream_connections[cIdx].vpc_id = parseInt(el.value) || 100; });
    bindInputs('.input-primary-intfs', (el, dIdx, cIdx) => { state.vpc_domains[dIdx].downstream_connections[cIdx].primary_member_interfaces = el.value.split(',').map(s => s.trim()).filter(Boolean); });
    bindInputs('.input-secondary-intfs', (el, dIdx, cIdx) => { state.vpc_domains[dIdx].downstream_connections[cIdx].secondary_member_interfaces = el.value.split(',').map(s => s.trim()).filter(Boolean); });
  }

  // Add Dynamic Domain Pair click handler
  elBtnCreateVpcDomain.addEventListener('click', () => {
    const newDomainId = state.vpc_domains.length > 0 ? Math.max(...state.vpc_domains.map(d => d.domain_id)) + 10 : 10;
    
    state.vpc_domains.push({
      domain_id: newDomainId,
      name: "vPC-Pair-Pod" + (state.vpc_domains.length + 1),
      primary_switch: state.devices[0]?.name || "NXOS-1",
      secondary_switch: state.devices[1]?.name || "NXOS-2",
      peer_link: {
        channel_group: newDomainId,
        interfaces: ["Ethernet1/1", "Ethernet1/2"]
      },
      peer_keepalive: {
        primary_ip: "",
        secondary_ip: "",
        vrf: "management"
      },
      downstream_connections: []
    });

    renderVpcDomains();
    populateVlanVpcDomainSelect();
    updateConfigPreviews();
  });

  // --- DYNAMIC DROPDOWNS POPULATE ON SWITCHES MODIFIED ---
  function populateVpcSelectors() {
    // Left empty since we do selections inside renderVpcDomains dynamically
  }

  function populateVlanVpcDomainSelect() {
    if (!elVlanVpcDomainSelect) return;
    elVlanVpcDomainSelect.innerHTML = '';

    const domains = state.vpc_domains || [];
    if (domains.length === 0) {
      elVlanVpcDomainSelect.innerHTML = '<option value="">No vPC domains configured</option>';
      return;
    }

    domains.forEach(d => {
      const option = document.createElement('option');
      option.value = d.domain_id;
      option.textContent = `vPC Domain ${d.domain_id} (${d.name})`;
      elVlanVpcDomainSelect.appendChild(option);
    });
  }

  function populateStandaloneSwitchSelects() {
    if (!elVlanSw1Select || !elVlanSw2Select) return;
    
    const sw1Current = elVlanSw1Select.value;
    const sw2Current = elVlanSw2Select.value;

    elVlanSw1Select.innerHTML = '<option value="">-- Choose Switch 1 --</option>';
    elVlanSw2Select.innerHTML = '<option value="">-- Choose Switch 2 (Optional) --</option>';

    state.devices.forEach(d => {
      const opt1 = document.createElement('option');
      opt1.value = d.name;
      opt1.textContent = `${d.name} (${d.ip})`;
      elVlanSw1Select.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = d.name;
      opt2.textContent = `${d.name} (${d.ip})`;
      elVlanSw2Select.appendChild(opt2);
    });

    if (state.devices.some(d => d.name === sw1Current)) elVlanSw1Select.value = sw1Current;
    if (state.devices.some(d => d.name === sw2Current)) elVlanSw2Select.value = sw2Current;
  }

  function populateDownstreamSwitchSelects() {
    if (!elDsPcSwitchSelect || !elDsSviSwitchSelect) return;
    const pcCurrent = elDsPcSwitchSelect.value;
    const sviCurrent = elDsSviSwitchSelect.value;

    elDsPcSwitchSelect.innerHTML = '<option value="">-- Choose Downstream Switch --</option>';
    elDsSviSwitchSelect.innerHTML = '<option value="">-- Choose Downstream Switch --</option>';

    const downstreamDevices = state.devices.filter(d => d.role && d.role.includes('downstream'));

    downstreamDevices.forEach(d => {
      const opt1 = document.createElement('option');
      opt1.value = d.name;
      opt1.textContent = `${d.name} (${d.ip})`;
      elDsPcSwitchSelect.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = d.name;
      opt2.textContent = `${d.name} (${d.ip})`;
      elDsSviSwitchSelect.appendChild(opt2);
    });

    if (downstreamDevices.some(d => d.name === pcCurrent)) elDsPcSwitchSelect.value = pcCurrent;
    if (downstreamDevices.some(d => d.name === sviCurrent)) elDsSviSwitchSelect.value = sviCurrent;
  }

  function populateDsSviVlanSelect() {
    if (!elDsSviVlanSelect) return;
    const selectedSw = elDsSviSwitchSelect.value;
    elDsSviVlanSelect.innerHTML = '<option value="">-- Select VLAN --</option>';

    if (!selectedSw) return;

    const configuredVlans = (state.downstream_port_channels || []).filter(item => item.switch_name === selectedSw);
    
    configuredVlans.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.vlan_id;
      opt.textContent = `VLAN ${v.vlan_id} (${v.vlan_name})`;
      elDsSviVlanSelect.appendChild(opt);
    });
  }

  // --- DYNAMIC CODE COMPILER AND PREVIEWS ---
  function updateConfigPreviews() {
    if (elBtnDeploy) {
      elBtnDeploy.style.display = 'none';
    }

    // 1. Compilevars/network_config.yml preview
    let yamlStr = `nexus_devices:\n`;
    state.devices.forEach(d => {
      // Resolve src_ip and peer_ip if in vPC Domain
      let peer_ip = "";
      let src_ip = "";
      const domain = (state.vpc_domains || []).find(dm => dm.primary_switch === d.name || dm.secondary_switch === d.name);
      if (domain) {
        if (domain.primary_switch === d.name) {
          src_ip = domain.peer_keepalive.primary_ip;
          peer_ip = domain.peer_keepalive.secondary_ip;
        } else {
          src_ip = domain.peer_keepalive.secondary_ip;
          peer_ip = domain.peer_keepalive.primary_ip;
        }
      }
      
      yamlStr += `  - name: "${d.name}"\n`;
      yamlStr += `    ip: "${d.ip}"\n`;
      yamlStr += `    role: "${d.role || 'leaf'}"\n`;
      if (peer_ip) yamlStr += `    peer_ip: "${peer_ip}"\n`;
      if (src_ip) yamlStr += `    src_ip: "${src_ip}"\n`;
    });

    yamlStr += `\nvpc_domains:\n`;
    (state.vpc_domains || []).forEach(vpc => {
      yamlStr += `  - domain_id: ${vpc.domain_id}\n`;
      yamlStr += `    name: "${vpc.name || 'Leaf-Pair'}"\n`;
      yamlStr += `    primary_switch: "${vpc.primary_switch}"\n`;
      yamlStr += `    secondary_switch: "${vpc.secondary_switch}"\n`;
      yamlStr += `    peer_link_channel_group: ${vpc.peer_link?.channel_group || 10}\n`;
      yamlStr += `    peer_link_interfaces: ${JSON.stringify(vpc.peer_link?.interfaces || [])}\n`;
      yamlStr += `    keepalive_primary_ip: "${vpc.peer_keepalive?.primary_ip || ''}"\n`;
      yamlStr += `    keepalive_secondary_ip: "${vpc.peer_keepalive?.secondary_ip || ''}"\n`;
      yamlStr += `    downstream_connections:\n`;
      (vpc.downstream_connections || []).forEach(conn => {
        yamlStr += `      - target_device: "${conn.target_device_name || 'Generic'}"\n`;
        yamlStr += `        channel_group: ${conn.channel_group || 100}\n`;
        yamlStr += `        vpc_id: ${conn.vpc_id || 100}\n`;
        yamlStr += `        primary_interfaces: ${JSON.stringify(conn.primary_member_interfaces || [])}\n`;
        yamlStr += `        secondary_interfaces: ${JSON.stringify(conn.secondary_member_interfaces || [])}\n`;
      });
      if (!vpc.downstream_connections || vpc.downstream_connections.length === 0) {
        yamlStr += `        []\n`;
      }
    });

    yamlStr += `\nvlans:\n`;
    (state.vlans || []).forEach(v => {
      yamlStr += `  - id: ${v.id}\n`;
      yamlStr += `    name: "${v.name}"\n`;
      yamlStr += `    vpc_domain_id: ${v.vpc_domain_id || 'null'}\n`;
      if (v.switch1) yamlStr += `    switch1: "${v.switch1}"\n`;
      if (v.switch2) yamlStr += `    switch2: "${v.switch2}"\n`;
      yamlStr += `    vip: "${v.vip}"\n`;
      yamlStr += `    mask: "${v.mask}"\n`;
      yamlStr += `    ip_switch1: "${v.ip_switch1}"\n`;
      yamlStr += `    ip_switch2: "${v.ip_switch2}"\n`;
      yamlStr += `    hsrp_priority_switch1: ${v.hsrp_priority_switch1}\n`;
      yamlStr += `    hsrp_priority_switch2: ${v.hsrp_priority_switch2}\n`;
    });

    yamlStr += `\ndownstream_port_channels:\n`;
    (state.downstream_port_channels || []).forEach(pc => {
      yamlStr += `  - switch_name: "${pc.switch_name}"\n`;
      yamlStr += `    port_channel_id: ${pc.port_channel_id}\n`;
      yamlStr += `    interfaces: ${JSON.stringify(pc.interfaces || [])}\n`;
    });
    if (!state.downstream_port_channels || state.downstream_port_channels.length === 0) {
      yamlStr += `    []\n`;
    }

    yamlStr += `\ndownstream_svis:\n`;
    (state.downstream_svis || []).forEach(svi => {
      yamlStr += `  - switch_name: "${svi.switch_name}"\n`;
      yamlStr += `    vlan_id: ${svi.vlan_id}\n`;
      yamlStr += `    vlan_name: "${svi.vlan_name}"\n`;
      yamlStr += `    ip_address: "${svi.ip_address}"\n`;
      yamlStr += `    netmask: "${svi.netmask}"\n`;
    });
    if (!state.downstream_svis || state.downstream_svis.length === 0) {
      yamlStr += `    []\n`;
    }

    elYamlContent.textContent = yamlStr;

    // 2. Compile inventory.ini preview dynamically
    const leafs = state.devices.filter(d => d.role && (d.role.includes('leaf') || d.role.includes('primary') || d.role.includes('secondary')));
    
    if (leafs.length === 0) {
      elIniContent.textContent = "; Please add switch nodes into the Switch Inventory to compile inventory.ini";
      return;
    }

    let iniStr = `[nexus]\n`;
    leafs.forEach(device => {
      let peer_ip = "";
      let src_ip = "";
      const domain = (state.vpc_domains || []).find(d => d.primary_switch === device.name || d.secondary_switch === device.name);
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
      iniStr += line + '\n';
    });

    const downstream = state.devices.filter(d => d.role && d.role.includes('downstream'));
    if (downstream.length > 0) {
      iniStr += `\n[downstream]\n`;
      downstream.forEach(device => {
        iniStr += `${device.name} ansible_host=${device.ip}\n`;
      });
    }

    iniStr += `\n[nexus:vars]\n`;
    iniStr += `ansible_user=${state.credentials.username || 'admin'}\n`;
    iniStr += `ansible_password=${state.credentials.password || 'admin'}\n`;
    iniStr += `ansible_ssh_pass=${state.credentials.password || 'admin'}\n`;
    iniStr += `ansible_network_os=nxos\n`;
    iniStr += `ansible_connection=network_cli\n`;
    iniStr += `ansible_ssh_common_args='-o PubkeyAuthentication=no'\n`;

    if (downstream.length > 0) {
      iniStr += `\n[downstream:vars]\n`;
      iniStr += `ansible_user=${state.credentials.username || 'admin'}\n`;
      iniStr += `ansible_password=${state.credentials.password || 'admin'}\n`;
      iniStr += `ansible_ssh_pass=${state.credentials.password || 'admin'}\n`;
      iniStr += `ansible_network_os=ios\n`;
      iniStr += `ansible_connection=network_cli\n`;
      iniStr += `ansible_ssh_common_args='-o PubkeyAuthentication=no'\n`;
    }

    elIniContent.textContent = iniStr;
  }

  // --- DYNAMIC VLAN TABLE ---
  function renderVlanTable() {
    elVlanTableBody.innerHTML = '';
    
    if (state.vlans.length === 0) {
      elVlanTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); font-style: italic; padding: 1.5rem;">
            No HSRP VLANs defined. Use input panel above to add subnets.
          </td>
        </tr>`;
      return;
    }

    state.vlans.forEach((v, idx) => {
      // Resolve host switches names
      let hostLabel = '';
      if (v.vpc_domain_id) {
        const d = (state.vpc_domains || []).find(dm => dm.domain_id === v.vpc_domain_id);
        hostLabel = d ? `vPC Domain ${d.domain_id} (${d.name})` : `vPC Domain ${v.vpc_domain_id}`;
      } else {
        hostLabel = `${v.switch1 || 'Standalone Switch'} ${v.switch2 ? '& ' + v.switch2 : ''}`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-vlan-id">${v.id}</td>
        <td style="font-weight: 600;">
          <div>${v.name}</div>
          <span style="font-size:0.72rem; color:var(--primary); font-weight:500;">📍 ${hostLabel}</span>
        </td>
        <td>
          <div class="vlan-ips">
            <span><strong>Switch 1:</strong> ${v.ip_switch1}/${v.mask}</span>
            <span><strong>Switch 2:</strong> ${v.ip_switch2 || 'N/A'}/${v.mask}</span>
          </div>
        </td>
        <td class="td-vlan-vip">${v.vip}/${v.mask}</td>
        <td>
          <div class="vlan-ips">
            <span><strong>Active Priority:</strong> ${v.hsrp_priority_switch1}</span>
            <span><strong>Standby Priority:</strong> ${v.hsrp_priority_switch2 || 'N/A'}</span>
          </div>
        </td>
        <td style="text-align: center;">
          <button type="button" class="btn-delete" data-index="${idx}">Delete</button>
        </td>
      `;
      elVlanTableBody.appendChild(tr);
    });

    // Add dynamic VLAN delete handlers
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.getAttribute('data-index'));
        state.vlans.splice(index, 1);
        renderVlanTable();
        updateConfigPreviews();
      });
    });
  }

  // --- ADD VLAN ACTION ---
  elBtnAddVlan.addEventListener('click', () => {
    const id = parseInt(elVlanId.value);
    const name = elVlanName.value.trim().toUpperCase();
    const vip = elVlanVip.value.trim();
    const mask = parseInt(elVlanMask.value) || 24;
    const hostType = elVlanHostType.value;
    
    let vpc_domain_id = null;
    let switch1 = "";
    let switch2 = "";
    let ip1 = "";
    let ip2 = "";

    if (!id || id < 1 || id > 4094) {
      alert("Please enter a valid VLAN ID (1 - 4094).");
      return;
    }
    if (state.vlans.some(v => v.id === id)) {
      alert(`VLAN ${id} is already configured.`);
      return;
    }
    if (!name) {
      alert("Please enter a VLAN Name.");
      return;
    }
    if (!vip || !isValidIp(vip)) {
      alert("Please enter a valid gateway Virtual IP.");
      return;
    }

    if (hostType === 'vpc') {
      vpc_domain_id = parseInt(elVlanVpcDomainSelect.value);
      ip1 = elVlanVpcIp1.value.trim();
      ip2 = elVlanVpcIp2.value.trim();

      if (!vpc_domain_id) {
        alert("Please select a hosting vPC Domain Pair.");
        return;
      }
      if (!ip1 || !isValidIp(ip1)) {
        alert("Please enter a valid Switch 1 IP.");
        return;
      }
      if (!ip2 || !isValidIp(ip2)) {
        alert("Please enter a valid Switch 2 IP.");
        return;
      }
    } else {
      switch1 = elVlanSw1Select.value;
      switch2 = elVlanSw2Select.value;
      ip1 = elVlanSw1Ip.value.trim();
      ip2 = elVlanSw2Ip.value.trim();

      if (!switch1) {
        alert("Please select Switch 1.");
        return;
      }
      if (!ip1 || !isValidIp(ip1)) {
        alert("Please enter Switch 1 IP.");
        return;
      }
      if (switch2 && (!ip2 || !isValidIp(ip2))) {
        alert("Please enter a valid Switch 2 IP.");
        return;
      }
    }

    const pri1 = parseInt(elVlanPri1.value) || 150;
    const pri2 = parseInt(elVlanPri2.value) || 120;

    const vlanObj = {
      id, name, vip, mask: mask.toString(),
      ip_switch1: ip1, ip_switch2: ip2,
      hsrp_priority_switch1: pri1,
      hsrp_priority_switch2: pri2
    };

    if (hostType === 'vpc') {
      vlanObj.vpc_domain_id = vpc_domain_id;
    } else {
      vlanObj.switch1 = switch1;
      if (switch2) vlanObj.switch2 = switch2;
    }

    state.vlans.push(vlanObj);

    // Clear form inputs
    elVlanId.value = '';
    elVlanName.value = '';
    elVlanVip.value = '';
    elVlanMask.value = '';
    elVlanVpcIp1.value = '';
    elVlanVpcIp2.value = '';
    elVlanSw1Ip.value = '';
    elVlanSw2Ip.value = '';
    elVlanPri1.value = '';
    elVlanPri2.value = '';

    renderVlanTable();
    updateConfigPreviews();
  });

  function isValidIp(ip) {
    const pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return pattern.test(ip.trim());
  }

  // 1. ADD DOWNSTREAM PORT-CHANNEL ACTION
  elBtnAddDsPc.addEventListener('click', () => {
    const swName = elDsPcSwitchSelect.value;
    const pcId = parseInt(elDsPcId.value);
    const portsStr = elDsPcInterfaces.value.trim();

    if (!swName) {
      alert("Please select a target downstream switch.");
      return;
    }
    if (!pcId || pcId < 1 || pcId > 4096) {
      alert("Please enter a valid Port-Channel ID (1 - 4096).");
      return;
    }
    if (!portsStr) {
      alert("Please enter physical member ports.");
      return;
    }

    if (!state.downstream_port_channels) state.downstream_port_channels = [];
    
    // Duplication check
    if (state.downstream_port_channels.some(pc => pc.switch_name === swName && pc.port_channel_id === pcId)) {
      alert(`Port-Channel ${pcId} is already configured on ${swName}.`);
      return;
    }

    const interfaces = portsStr.split(',').map(p => p.trim()).filter(Boolean);

    state.downstream_port_channels.push({
      id: 'ds-pc-' + Date.now(),
      switch_name: swName,
      port_channel_id: pcId,
      interfaces: interfaces
    });

    elDsPcId.value = '';
    elDsPcInterfaces.value = '';

    renderDsPcTable();
    updateConfigPreviews();
  });

  // 2. ADD DOWNSTREAM SVI ACTION
  elBtnAddDsSvi.addEventListener('click', () => {
    const swName = elDsSviSwitchSelect.value;
    const vlanId = parseInt(elDsSviVlanId.value);
    const vlanName = elDsSviVlanName.value.trim().toUpperCase();
    const ip = elDsSviIp.value.trim();
    const mask = elDsSviNetmask.value.trim();

    if (!swName) {
      alert("Please select a target downstream switch.");
      return;
    }
    if (!vlanId || vlanId < 1 || vlanId > 4094) {
      alert("Please enter a valid VLAN ID (1 - 4094).");
      return;
    }
    if (!vlanName) {
      alert("Please enter a VLAN Name.");
      return;
    }
    if (!ip || !isValidIp(ip)) {
      alert("Please enter a valid IP address.");
      return;
    }
    if (!mask || !isValidIp(mask)) {
      alert("Please enter a valid Subnet Mask (e.g. 255.255.255.0).");
      return;
    }

    if (!state.downstream_svis) state.downstream_svis = [];

    // Duplication check
    if (state.downstream_svis.some(svi => svi.switch_name === swName && svi.vlan_id === vlanId)) {
      alert(`VLAN ${vlanId} SVI is already configured on ${swName}.`);
      return;
    }

    state.downstream_svis.push({
      id: 'ds-svi-' + Date.now(),
      switch_name: swName,
      vlan_id: vlanId,
      vlan_name: vlanName,
      ip_address: ip,
      netmask: mask
    });

    elDsSviVlanId.value = '';
    elDsSviVlanName.value = '';
    elDsSviIp.value = '';
    elDsSviNetmask.value = '255.255.255.0'; // fallback netmask

    renderDsSviTable();
    updateConfigPreviews();
  });

  function renderDsPcTable() {
    if (!elDsPcTableBody) return;
    elDsPcTableBody.innerHTML = '';

    const portChannels = state.downstream_port_channels || [];

    if (portChannels.length === 0) {
      elDsPcTableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--text-muted); font-style: italic; padding: 1.5rem;">
            No downstream port-channels configured. Use form above to add aggregates.
          </td>
        </tr>`;
      return;
    }

    portChannels.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.switch_name}</td>
        <td style="font-weight: 600;">Port-channel${item.port_channel_id}</td>
        <td>${item.interfaces.join(', ')}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-delete" data-ds-pc-idx="${idx}">Delete</button>
        </td>
      `;
      elDsPcTableBody.appendChild(tr);
    });

    // Bind delete events
    elDsPcTableBody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-ds-pc-idx'));
        state.downstream_port_channels.splice(idx, 1);
        renderDsPcTable();
        updateConfigPreviews();
      });
    });
  }

  function renderDsSviTable() {
    if (!elDsSviTableBody) return;
    elDsSviTableBody.innerHTML = '';

    const svis = state.downstream_svis || [];

    if (svis.length === 0) {
      elDsSviTableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--text-muted); font-style: italic; padding: 1.5rem;">
            No downstream SVIs configured. Use form above to add IP interfaces.
          </td>
        </tr>`;
      return;
    }

    svis.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.switch_name}</td>
        <td class="td-vlan-id">Vlan${item.vlan_id} (${item.vlan_name})</td>
        <td><strong>${item.ip_address}</strong> / ${item.netmask}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-delete" data-ds-svi-idx="${idx}">Delete</button>
        </td>
      `;
      elDsSviTableBody.appendChild(tr);
    });

    // Bind delete events
    elDsSviTableBody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-ds-svi-idx'));
        state.downstream_svis.splice(idx, 1);
        renderDsSviTable();
        updateConfigPreviews();
      });
    });
  }

  // --- SAVE STATE API CALL ---
  async function saveConfigToServer() {
    try {
      syncInputsToState();
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save state.");
      return true;
    } catch (err) {
      console.error(err);
      appendTerminalLine(`\n❌ ERROR SAVING CONFIGURATIONS: ${err.message}`, 'failed');
      return false;
    }
  }

  elBtnSaveConfig.addEventListener('click', async () => {
    const ok = await saveConfigToServer();
    if (ok) {
      alert("Orchestration state saved to local JSON database and playbook variable files compiled!");
    }
  });

  // --- TERMINAL LOGGER & STYLER ---
  function appendTerminalLine(text, type = 'stdout') {
    const line = document.createElement('div');
    line.className = `line ${type}`;
    line.textContent = text;
    elTerminal.appendChild(line);

    if (type === 'stdout') {
      if (text.includes('PLAY [') || text.includes('PLAY RECAP')) {
        line.className = 'line play';
      } else if (text.includes('TASK [')) {
        line.className = 'line task';
      } else if (text.includes('ok:')) {
        line.className = 'line ok';
      } else if (text.includes('changed:')) {
        line.className = 'line changed';
      } else if (text.includes('failed:') || text.includes('fatal:')) {
        line.className = 'line failed';
      }
    }

    if (elAutoScroll.checked) {
      elTerminal.scrollTop = elTerminal.scrollHeight;
    }
  }

  elBtnClearTerminal.addEventListener('click', () => {
    elTerminal.innerHTML = '<div class="line system">> Terminal logs cleared. Console Ready.</div>';
  });

  // --- MODULAR ANSIBLE DEPLOY PUSH ---
  async function runDeployment(isSimulated) {
    const featuresToDeploy = [];
    if (elDeployVpcBox.checked) featuresToDeploy.push('vpc');
    if (elDeployHsrpBox.checked) featuresToDeploy.push('hsrp');

    if (featuresToDeploy.length === 0) {
      alert("Please select at least one target module (Deploy vPC or Deploy HSRP) before running!");
      return;
    }

    appendTerminalLine(isSimulated ? "\n> Automatically synchronizing database state with backend..." : "\n> Preparing production deployment state...", "system");
    const saved = await saveConfigToServer();
    if (!saved) return;

    if (state.devices.length < 2) {
      alert("Minimum two switch devices (Primary and Secondary Leaf) are required to build a fabric configuration.");
      return;
    }

    elBtnVerify.disabled = true;
    elBtnDeploy.disabled = true;
    
    if (isSimulated) {
      elBtnVerify.textContent = "Verifying...";
    } else {
      elBtnDeploy.textContent = "Pushing...";
    }

    appendTerminalLine(isSimulated ? "> Launching Ansible Simulator Verification..." : "> Connecting to Remote Control Node to Push Configs...", "system");

    const featuresList = featuresToDeploy.join(',');
    const url = `/api/deploy?simulate=${isSimulated}&features=${featuresList}`;

    if (deploymentEventSource) {
      deploymentEventSource.close();
    }

    deploymentEventSource = new EventSource(url);

    deploymentEventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        appendTerminalLine(data.message, data.type);
      } catch (err) {
        appendTerminalLine(event.data, 'stdout');
      }
    };

    deploymentEventSource.addEventListener('end', (event) => {
      const data = JSON.parse(event.data);
      appendTerminalLine(`\n> Orchestration job completed. Status: ${data.status.toUpperCase()}`, 'system');
      
      if (isSimulated && data.status === 'success') {
        appendTerminalLine("\n> ✅ SIMULATION VERIFICATION SUCCESSFUL! Configuration verified safe.", "system");
        appendTerminalLine("> Unlocking 'Push to Production' control button...", "system");
        elBtnDeploy.style.display = 'inline-flex';
      } else if (!isSimulated && data.status === 'success') {
        appendTerminalLine("\n> 🏆 PRODUCTION DEPLOYMENT COMPLETED SUCCESSFULLY!", "system");
      }
      
      cleanupDeployment();
    });

    deploymentEventSource.onerror = (err) => {
      appendTerminalLine("\n❌ EventSource stream connection lost or remote server unreachable.", "failed");
      cleanupDeployment();
    };
  }

  elBtnVerify.addEventListener('click', () => runDeployment(true));
  elBtnDeploy.addEventListener('click', () => runDeployment(false));

  function cleanupDeployment() {
    if (deploymentEventSource) {
      deploymentEventSource.close();
      deploymentEventSource = null;
    }
    elBtnVerify.disabled = false;
    elBtnDeploy.disabled = false;
    elBtnVerify.textContent = "🔍 Run Verification";
    elBtnDeploy.textContent = "🚀 Push to Production";
  }

  // --- INIT BOOTSTRAP STATE ---
  async function init() {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      
      state = data;
      
      // Proactive schema alignment and crash-proofing fallbacks
      if (!state.credentials) state.credentials = { username: 'admin', password: 'admin' };
      if (!state.ansible_server) state.ansible_server = { target: 'remote', host: '192.168.1.12', port: 22, username: 'root', password: 'admin', workspace: '/home/admin/ansible-nexus' };
      if (!state.devices) state.devices = [];
      if (!state.vpc_domains) state.vpc_domains = [];
      if (!state.vlans) state.vlans = [];
      if (!state.downstream_port_channels) state.downstream_port_channels = [];
      if (!state.downstream_svis) state.downstream_svis = [];
      
      syncStateToInputs();
      renderSwitchGrid();
      renderVpcDomains();
      populateVlanVpcDomainSelect();
      populateStandaloneSwitchSelects();
      populateDownstreamSwitchSelects();
      renderVlanTable();
      renderDsPcTable();
      renderDsSviTable();
      updateConfigPreviews();
      
      appendTerminalLine("> Successfully loaded orchestration state from local database.", "system");
    } catch (err) {
      console.error(err);
      appendTerminalLine("> Warning: Failed to contact backend configuration API. Operating in local sandbox mode.", "system");
      
      if (!state.credentials) state.credentials = { username: 'admin', password: 'admin' };
      if (!state.ansible_server) state.ansible_server = { target: 'remote', host: '192.168.1.12', port: 22, username: 'root', password: 'admin', workspace: '/home/admin/ansible-nexus' };
      if (!state.devices) state.devices = [];
      if (!state.vpc_domains) state.vpc_domains = [];
      if (!state.vlans) state.vlans = [];
      if (!state.downstream_port_channels) state.downstream_port_channels = [];
      if (!state.downstream_svis) state.downstream_svis = [];

      syncStateToInputs();
      renderSwitchGrid();
      renderVpcDomains();
      populateVlanVpcDomainSelect();
      populateStandaloneSwitchSelects();
      populateDownstreamSwitchSelects();
      renderVlanTable();
      renderDsPcTable();
      renderDsSviTable();
      updateConfigPreviews();
    }
  }

  init();
});
