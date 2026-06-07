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
    ],
    palo_alto: {
      devices: [
        {
          id: 'default-fw',
          name: 'Palo-Alto-Primary',
          mode: 'standalone',
          host: '192.168.1.50',
          host_secondary: '',
          port: 443,
          username: 'admin',
          password: '',
          address_objects: [],
          service_objects: [],
          security_policies: [],
          nat_policies: []
        }
      ],
      activeDeviceId: 'default-fw'
    }
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
  const deactivateAllTabs = () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dropdown-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  };

  document.querySelectorAll('.nav-tab:not(.dropdown-toggle), .dropdown-item').forEach(tab => {
    tab.addEventListener('click', () => {
      deactivateAllTabs();
      
      tab.classList.add('active');
      const targetTabId = tab.getAttribute('data-tab');
      document.getElementById(targetTabId).classList.add('active');
      
      if (tab.classList.contains('dropdown-item')) {
        const parentDropdown = tab.closest('.nav-dropdown');
        if (parentDropdown) {
          const toggleBtn = parentDropdown.querySelector('.dropdown-toggle');
          if (toggleBtn) {
            toggleBtn.classList.add('active');
          }
        }
      }
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

  function getActiveFirewall() {
    if (!state.palo_alto) {
      state.palo_alto = {
        devices: [
          {
            id: 'default-fw',
            name: 'Palo-Alto-Primary',
            mode: 'standalone',
            host: '192.168.1.50',
            host_secondary: '',
            port: 443,
            username: 'admin',
            password: '',
            address_objects: [],
            service_objects: [],
            security_policies: [],
            nat_policies: []
          }
        ],
        activeDeviceId: 'default-fw'
      };
    }
    if (!state.palo_alto.devices) {
      const oldFw = {
        id: 'default-fw',
        name: 'Palo-Alto-Primary',
        mode: 'standalone',
        host: state.palo_alto.device?.host || '192.168.1.50',
        host_secondary: '',
        port: state.palo_alto.device?.port || 443,
        username: state.palo_alto.device?.username || 'admin',
        password: state.palo_alto.device?.password || '',
        address_objects: state.palo_alto.address_objects || [],
        service_objects: state.palo_alto.service_objects || [],
        security_policies: state.palo_alto.security_policies || [],
        nat_policies: state.palo_alto.nat_policies || []
      };
      state.palo_alto.devices = [oldFw];
      state.palo_alto.activeDeviceId = 'default-fw';
    }
    let active = state.palo_alto.devices.find(d => d.id === state.palo_alto.activeDeviceId);
    if (!active && state.palo_alto.devices.length > 0) {
      active = state.palo_alto.devices[0];
      state.palo_alto.activeDeviceId = active.id;
    }
    return active;
  }

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

    const activeFw = getActiveFirewall();
    if (activeFw) {
      const nameEl = document.getElementById('paloFwName');
      const modeEl = document.getElementById('paloFwMode');
      const hostEl = document.getElementById('paloHost');
      const hostSecEl = document.getElementById('paloHostSecondary');
      const portEl = document.getElementById('paloPort');
      const userEl = document.getElementById('paloUser');
      const passEl = document.getElementById('paloPass');

      if (nameEl) activeFw.name = nameEl.value.trim() || activeFw.name;
      if (modeEl) activeFw.mode = modeEl.value;
      if (hostEl) activeFw.host = hostEl.value.trim();
      if (hostSecEl) activeFw.host_secondary = hostSecEl.value.trim();
      if (portEl) activeFw.port = parseInt(portEl.value) || 443;
      if (userEl) activeFw.username = userEl.value.trim();
      if (passEl) activeFw.password = passEl.value;
    }
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

    const activeFw = getActiveFirewall();
    if (activeFw) {
      const nameEl = document.getElementById('paloFwName');
      const modeEl = document.getElementById('paloFwMode');
      const hostEl = document.getElementById('paloHost');
      const hostSecEl = document.getElementById('paloHostSecondary');
      const portEl = document.getElementById('paloPort');
      const userEl = document.getElementById('paloUser');
      const passEl = document.getElementById('paloPass');

      if (nameEl) nameEl.value = activeFw.name || '';
      if (modeEl) modeEl.value = activeFw.mode || 'standalone';
      if (hostEl) hostEl.value = activeFw.host || '';
      if (hostSecEl) hostSecEl.value = activeFw.host_secondary || '';
      if (portEl) portEl.value = activeFw.port || 443;
      if (userEl) userEl.value = activeFw.username || '';
      if (passEl) passEl.value = activeFw.password || '';

      const secContainer = document.getElementById('paloHostSecondaryContainer');
      if (secContainer) {
        secContainer.style.display = activeFw.mode === 'ha-pair' ? 'block' : 'none';
      }
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

    // 1. Compile vars/network_config.yml preview
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
    
    let iniStr = leafs.length === 0 ? "; Please add switch nodes into the Switch Inventory to compile inventory.ini" : `[nexus]\n`;
    if (leafs.length > 0) {
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
    }

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

    // 3. Compile Palo Alto vars preview
    const palo = getActiveFirewall();
    let paloYaml = `palo_alto_device:\n`;
    paloYaml += `  name: "${palo?.name || ''}"\n`;
    paloYaml += `  mode: "${palo?.mode || 'standalone'}"\n`;
    paloYaml += `  host: "${palo?.host || ''}"\n`;
    if (palo?.mode === 'ha-pair') {
      paloYaml += `  host_secondary: "${palo?.host_secondary || ''}"\n`;
    }
    paloYaml += `  port: ${palo?.port || 443}\n`;
    paloYaml += `  username: "${palo?.username || ''}"\n`;
    
    paloYaml += `\naddress_objects:\n`;
    (palo?.address_objects || []).forEach(ao => {
      paloYaml += `  - name: "${ao.name}"\n`;
      paloYaml += `    type: "${ao.type}"\n`;
      paloYaml += `    value: "${ao.value}"\n`;
    });
    if (!palo?.address_objects || palo.address_objects.length === 0) {
      paloYaml += `    []\n`;
    }

    paloYaml += `\nservice_objects:\n`;
    (palo?.service_objects || []).forEach(so => {
      paloYaml += `  - name: "${so.name}"\n`;
      paloYaml += `    protocol: "${so.protocol}"\n`;
      paloYaml += `    port: "${so.port}"\n`;
    });
    if (!palo?.service_objects || palo.service_objects.length === 0) {
      paloYaml += `    []\n`;
    }

    paloYaml += `\nsecurity_rules:\n`;
    (palo?.security_policies || []).forEach(rule => {
      paloYaml += `  - name: "${rule.name}"\n`;
      paloYaml += `    from_zone: "${rule.from_zone}"\n`;
      paloYaml += `    to_zone: "${rule.to_zone}"\n`;
      paloYaml += `    source: "${rule.source}"\n`;
      paloYaml += `    destination: "${rule.destination}"\n`;
      paloYaml += `    service: "${rule.service}"\n`;
      paloYaml += `    action: "${rule.action}"\n`;
    });
    if (!palo?.security_policies || palo.security_policies.length === 0) {
      paloYaml += `    []\n`;
    }

    paloYaml += `\nnat_policies:\n`;
    (palo?.nat_policies || []).forEach(rule => {
      paloYaml += `  - name: "${rule.name}"\n`;
      paloYaml += `    from_zone: "${rule.from_zone}"\n`;
      paloYaml += `    to_zone: "${rule.to_zone}"\n`;
      paloYaml += `    source: "${rule.source}"\n`;
      paloYaml += `    destination: "${rule.destination}"\n`;
      paloYaml += `    service: "${rule.service}"\n`;
      paloYaml += `    translated_ip: "${rule.translated_ip}"\n`;
      paloYaml += `    translated_port: "${rule.translated_port}"\n`;
    });
    if (!palo?.nat_policies || palo.nat_policies.length === 0) {
      paloYaml += `    []\n`;
    }
    document.getElementById('paloYamlContent').textContent = paloYaml;

    // 4. Compile Palo Alto set commands preview
    let paloSet = ``;
    if (palo?.mode === 'ha-pair') {
      paloSet += `# HA Pair deployment mode detected. Sync commands should run on the active unit.\n`;
      paloSet += `# Primary firewall IP: ${palo.host}, Secondary firewall IP: ${palo.host_secondary}\n`;
    } else {
      paloSet += `# Standalone deployment mode. Firewall IP: ${palo?.host || ''}\n`;
    }
    paloSet += `configure\n`;
    (palo?.address_objects || []).forEach(ao => {
      paloSet += `set address ${ao.name} ${ao.type} ${ao.value}\n`;
    });
    (palo?.service_objects || []).forEach(so => {
      paloSet += `set service ${so.name} protocol ${so.protocol} port ${so.port}\n`;
    });
    (palo?.security_policies || []).forEach(rule => {
      paloSet += `set rulebase security rules ${rule.name} from ${rule.from_zone} to ${rule.to_zone} source ${rule.source} destination ${rule.destination} service ${rule.service} action ${rule.action}\n`;
    });
    (palo?.nat_policies || []).forEach(rule => {
      paloSet += `set rulebase nat rules ${rule.name} from ${rule.from_zone} to ${rule.to_zone} source ${rule.source} destination ${rule.destination} service ${rule.service} destination-translation translated-address ${rule.translated_ip} translated-port ${rule.translated_port}\n`;
    });
    paloSet += `commit\n`;
    document.getElementById('paloSetContent').textContent = paloSet;
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
    if (document.getElementById('deployPaloBox').checked) featuresToDeploy.push('palo_alto');

    if (featuresToDeploy.length === 0) {
      alert("Please select at least one target module (Deploy vPC, Deploy HSRP, or Deploy Palo Alto Policy) before running!");
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
      if (!state.palo_alto) state.palo_alto = { device: { host: '', port: 443, username: '', password: '' }, address_objects: [], service_objects: [], security_policies: [] };
      
      syncStateToInputs();
      renderSwitchGrid();
      renderVpcDomains();
      populateVlanVpcDomainSelect();
      populateStandaloneSwitchSelects();
      populateDownstreamSwitchSelects();
      renderVlanTable();
      renderDsPcTable();
      renderDsSviTable();
      
      // Palo Alto bindings & renderers
      const activeFw = getActiveFirewall();
      if (activeFw && elActiveFwModeBadge) {
        elActiveFwModeBadge.textContent = activeFw.mode === 'ha-pair' ? 'HA Pair Mode' : 'Standalone Mode';
      }
      populateActivePaloSelector();
      renderPaloDevicesTable();
      renderAddrObjTable();
      renderSrvObjTable();
      renderRuleTable();
      renderNatRuleTable();
      populatePolicySelectors();
      
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
      
      // Ensure schema compatibility
      getActiveFirewall();

      syncStateToInputs();
      renderSwitchGrid();
      renderVpcDomains();
      populateVlanVpcDomainSelect();
      populateStandaloneSwitchSelects();
      populateDownstreamSwitchSelects();
      renderVlanTable();
      renderDsPcTable();
      renderDsSviTable();
      
      // Palo Alto bindings & renderers
      const activeFwCatch = getActiveFirewall();
      if (activeFwCatch && elActiveFwModeBadge) {
        elActiveFwModeBadge.textContent = activeFwCatch.mode === 'ha-pair' ? 'HA Pair Mode' : 'Standalone Mode';
      }
      populateActivePaloSelector();
      renderPaloDevicesTable();
      renderAddrObjTable();
      renderSrvObjTable();
      renderRuleTable();
      renderNatRuleTable();
      populatePolicySelectors();
      
      updateConfigPreviews();
    }
  }

  // --- PALO ALTO FIREWALL EVENT HANDLERS ---
  const elActivePaloSelector = document.getElementById('activePaloSelector');
  const elActiveFwModeBadge = document.getElementById('activeFwModeBadge');
  const elPaloFwName = document.getElementById('paloFwName');
  const elPaloFwMode = document.getElementById('paloFwMode');
  const elPaloHostSecondaryContainer = document.getElementById('paloHostSecondaryContainer');
  const elPaloHostSecondary = document.getElementById('paloHostSecondary');
  const elBtnSavePaloDevice = document.getElementById('btnSavePaloDevice');
  const elPaloDevicesTableBody = document.getElementById('paloDevicesTableBody');

  const elPaloHost = document.getElementById('paloHost');
  const elPaloPort = document.getElementById('paloPort');
  const elPaloUser = document.getElementById('paloUser');
  const elPaloPass = document.getElementById('paloPass');

  const elAddrObjName = document.getElementById('addrObjName');
  const elAddrObjType = document.getElementById('addrObjType');
  const elAddrObjValue = document.getElementById('addrObjValue');
  const elBtnAddAddrObj = document.getElementById('btnAddAddrObj');
  const elAddrObjTableBody = document.getElementById('addrObjTableBody');

  const elSrvObjName = document.getElementById('srvObjName');
  const elSrvObjProto = document.getElementById('srvObjProto');
  const elSrvObjPort = document.getElementById('srvObjPort');
  const elBtnAddSrvObj = document.getElementById('btnAddSrvObj');
  const elSrvObjTableBody = document.getElementById('srvObjTableBody');

  const elRuleName = document.getElementById('ruleName');
  const elRuleAction = document.getElementById('ruleAction');
  const elRuleFromZone = document.getElementById('ruleFromZone');
  const elRuleToZone = document.getElementById('ruleToZone');
  const elRuleSrcAddrSelect = document.getElementById('ruleSrcAddrSelect');
  const elRuleDstAddrSelect = document.getElementById('ruleDstAddrSelect');
  const elRuleSrvSelect = document.getElementById('ruleSrvSelect');
  const elBtnAddRule = document.getElementById('btnAddRule');
  const elRuleTableBody = document.getElementById('ruleTableBody');

  const elNatRuleName = document.getElementById('natRuleName');
  const elNatFromZone = document.getElementById('natFromZone');
  const elNatToZone = document.getElementById('natToZone');
  const elNatSrcAddrSelect = document.getElementById('natSrcAddrSelect');
  const elNatDstAddrSelect = document.getElementById('natDstAddrSelect');
  const elNatSrvSelect = document.getElementById('natSrvSelect');
  const elNatTransIp = document.getElementById('natTransIp');
  const elNatTransPort = document.getElementById('natTransPort');
  const elBtnAddNatRule = document.getElementById('btnAddNatRule');
  const elNatTableBody = document.getElementById('natTableBody');

  const elPaloYamlContent = document.getElementById('paloYamlContent');
  const elPaloSetContent = document.getElementById('paloSetContent');

  // Sync inputs on change
  [
    elPaloFwName, elPaloFwMode, elPaloHost, elPaloHostSecondary,
    elPaloPort, elPaloUser, elPaloPass
  ].forEach(el => {
    if (el) {
      el.addEventListener('change', () => {
        syncInputsToState();
        updateConfigPreviews();
      });
      el.addEventListener('input', () => {
        syncInputsToState();
        updateConfigPreviews();
      });
    }
  });

  if (elPaloFwMode) {
    elPaloFwMode.addEventListener('change', () => {
      const mode = elPaloFwMode.value;
      const secContainer = document.getElementById('paloHostSecondaryContainer');
      if (secContainer) {
        secContainer.style.display = mode === 'ha-pair' ? 'block' : 'none';
      }
      syncInputsToState();
      updateConfigPreviews();
    });
  }

  if (elActivePaloSelector) {
    elActivePaloSelector.addEventListener('change', () => {
      const id = elActivePaloSelector.value;
      state.palo_alto.activeDeviceId = id;
      
      const activeFw = getActiveFirewall();
      if (activeFw && elActiveFwModeBadge) {
        elActiveFwModeBadge.textContent = activeFw.mode === 'ha-pair' ? 'HA Pair Mode' : 'Standalone Mode';
      }

      syncStateToInputs();
      renderPaloDevicesTable();
      renderAddrObjTable();
      renderSrvObjTable();
      renderRuleTable();
      renderNatRuleTable();
      populatePolicySelectors();
      updateConfigPreviews();
    });
  }

  if (elBtnSavePaloDevice) {
    elBtnSavePaloDevice.addEventListener('click', () => {
      const name = elPaloFwName.value.trim() || `Firewall-${Date.now().toString().slice(-4)}`;
      const mode = elPaloFwMode.value;
      const host = elPaloHost.value.trim();
      const host_secondary = elPaloHostSecondary.value.trim();
      const port = parseInt(elPaloPort.value) || 443;
      const username = elPaloUser.value.trim();
      const password = elPaloPass.value;

      if (!host) {
        alert("Please enter Firewall Primary management IP.");
        return;
      }
      if (mode === 'ha-pair' && !host_secondary) {
        alert("Please enter Secondary management IP for HA Pair.");
        return;
      }

      // Find if device with same name already exists
      let existing = state.palo_alto.devices.find(d => d.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        existing.mode = mode;
        existing.host = host;
        existing.host_secondary = host_secondary;
        existing.port = port;
        existing.username = username;
        if (password) existing.password = password;
        alert(`Updated configuration for existing firewall device "${name}".`);
      } else {
        const newFw = {
          id: Date.now().toString(),
          name,
          mode,
          host,
          host_secondary,
          port,
          username,
          password,
          address_objects: [],
          service_objects: [],
          security_policies: [],
          nat_policies: []
        };
        state.palo_alto.devices.push(newFw);
        state.palo_alto.activeDeviceId = newFw.id;
        alert(`Saved and switched to new firewall device target "${name}".`);
      }

      const activeFw = getActiveFirewall();
      if (activeFw && elActiveFwModeBadge) {
        elActiveFwModeBadge.textContent = activeFw.mode === 'ha-pair' ? 'HA Pair Mode' : 'Standalone Mode';
      }

      syncStateToInputs();
      populateActivePaloSelector();
      renderPaloDevicesTable();
      renderAddrObjTable();
      renderSrvObjTable();
      renderRuleTable();
      renderNatRuleTable();
      populatePolicySelectors();
      updateConfigPreviews();
    });
  }

  // Render Address Objects
  // Render Address Objects
  function renderAddrObjTable() {
    if (!elAddrObjTableBody) return;
    elAddrObjTableBody.innerHTML = '';
    const activeFw = getActiveFirewall();
    const objects = activeFw?.address_objects || [];

    if (objects.length === 0) {
      elAddrObjTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);font-style:italic;">No Address Objects.</td></tr>`;
      return;
    }

    objects.forEach((ao, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600;">${ao.name}</td>
        <td><span class="zone-badge">${ao.type}</span></td>
        <td><code style="font-family:var(--font-mono);">${ao.value}</code></td>
        <td style="text-align:center;"><button type="button" class="btn-delete" data-addr-idx="${idx}">Delete</button></td>
      `;
      elAddrObjTableBody.appendChild(tr);
    });

    elAddrObjTableBody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-addr-idx'));
        const activeFw = getActiveFirewall();
        if (activeFw && activeFw.address_objects) {
          activeFw.address_objects.splice(idx, 1);
          renderAddrObjTable();
          populatePolicySelectors();
          updateConfigPreviews();
        }
      });
    });
  }

  // Render Service Objects
  function renderSrvObjTable() {
    if (!elSrvObjTableBody) return;
    elSrvObjTableBody.innerHTML = '';
    const activeFw = getActiveFirewall();
    const objects = activeFw?.service_objects || [];

    if (objects.length === 0) {
      elSrvObjTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);font-style:italic;">No Service Objects.</td></tr>`;
      return;
    }

    objects.forEach((so, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600;">${so.name}</td>
        <td><span class="zone-badge">${so.protocol.toUpperCase()}</span></td>
        <td><code style="font-family:var(--font-mono);">${so.port}</code></td>
        <td style="text-align:center;"><button type="button" class="btn-delete" data-srv-idx="${idx}">Delete</button></td>
      `;
      elSrvObjTableBody.appendChild(tr);
    });

    elSrvObjTableBody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-srv-idx'));
        const activeFw = getActiveFirewall();
        if (activeFw && activeFw.service_objects) {
          activeFw.service_objects.splice(idx, 1);
          renderSrvObjTable();
          populatePolicySelectors();
          updateConfigPreviews();
        }
      });
    });
  }

  // Populate dynamic policy dropdown selectors
  function populatePolicySelectors() {
    const elRuleSrcAddrSelect = document.getElementById('ruleSrcAddrSelect');
    const elRuleDstAddrSelect = document.getElementById('ruleDstAddrSelect');
    const elRuleSrvSelect = document.getElementById('ruleSrvSelect');

    const elNatSrcAddrSelect = document.getElementById('natSrcAddrSelect');
    const elNatDstAddrSelect = document.getElementById('natDstAddrSelect');
    const elNatSrvSelect = document.getElementById('natSrvSelect');

    if (!elRuleSrcAddrSelect || !elRuleDstAddrSelect || !elRuleSrvSelect) return;
    
    const srcCurrent = elRuleSrcAddrSelect.value;
    const dstCurrent = elRuleDstAddrSelect.value;
    const srvCurrent = elRuleSrvSelect.value;

    const natSrcCurrent = elNatSrcAddrSelect ? elNatSrcAddrSelect.value : 'any';
    const natDstCurrent = elNatDstAddrSelect ? elNatDstAddrSelect.value : 'any';
    const natSrvCurrent = elNatSrvSelect ? elNatSrvSelect.value : 'any';

    elRuleSrcAddrSelect.innerHTML = '<option value="any">any</option>';
    elRuleDstAddrSelect.innerHTML = '<option value="any">any</option>';
    elRuleSrvSelect.innerHTML = '<option value="any">any</option>';

    if (elNatSrcAddrSelect) elNatSrcAddrSelect.innerHTML = '<option value="any">any</option>';
    if (elNatDstAddrSelect) elNatDstAddrSelect.innerHTML = '<option value="any">any</option>';
    if (elNatSrvSelect) elNatSrvSelect.innerHTML = '<option value="any">any</option>';

    const activeFw = getActiveFirewall();
    const addrs = activeFw?.address_objects || [];
    addrs.forEach(ao => {
      const opt1 = document.createElement('option');
      opt1.value = ao.name;
      opt1.textContent = ao.name;
      elRuleSrcAddrSelect.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = ao.name;
      opt2.textContent = ao.name;
      elRuleDstAddrSelect.appendChild(opt2);

      if (elNatSrcAddrSelect) {
        const optNat1 = document.createElement('option');
        optNat1.value = ao.name;
        optNat1.textContent = ao.name;
        elNatSrcAddrSelect.appendChild(optNat1);
      }
      if (elNatDstAddrSelect) {
        const optNat2 = document.createElement('option');
        optNat2.value = ao.name;
        optNat2.textContent = ao.name;
        elNatDstAddrSelect.appendChild(optNat2);
      }
    });

    const srvs = activeFw?.service_objects || [];
    srvs.forEach(so => {
      const opt = document.createElement('option');
      opt.value = so.name;
      opt.textContent = `${so.name} (${so.protocol.toUpperCase()}/${so.port})`;
      elRuleSrvSelect.appendChild(opt);

      if (elNatSrvSelect) {
        const optNat = document.createElement('option');
        optNat.value = so.name;
        optNat.textContent = `${so.name} (${so.protocol.toUpperCase()}/${so.port})`;
        elNatSrvSelect.appendChild(optNat);
      }
    });

    elRuleSrcAddrSelect.value = srcCurrent;
    elRuleDstAddrSelect.value = dstCurrent;
    elRuleSrvSelect.value = srvCurrent;

    if (elNatSrcAddrSelect) elNatSrcAddrSelect.value = natSrcCurrent;
    if (elNatDstAddrSelect) elNatDstAddrSelect.value = natDstCurrent;
    if (elNatSrvSelect) elNatSrvSelect.value = natSrvCurrent;
  }

  // Render Access Policies
  function renderRuleTable() {
    if (!elRuleTableBody) return;
    elRuleTableBody.innerHTML = '';
    const activeFw = getActiveFirewall();
    const rules = activeFw?.security_policies || [];

    if (rules.length === 0) {
      elRuleTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);font-style:italic;">No Security Rules Configured.</td></tr>`;
      return;
    }

    rules.forEach((rule, idx) => {
      const actionBadge = rule.action === 'allow' ? '<span class="badge-allow">Allow</span>' : '<span class="badge-deny">Deny</span>';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600;">${rule.name}</td>
        <td>
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span>From: <span class="zone-badge">${rule.from_zone}</span></span>
            <span>To: <span class="zone-badge">${rule.to_zone}</span></span>
          </div>
        </td>
        <td>
          <div style="display:flex;flex-direction:column;gap:2px;font-family:var(--font-mono);font-size:0.75rem;">
            <span>Src: <strong>${rule.source}</strong></span>
            <span>Dst: <strong>${rule.destination}</strong></span>
          </div>
        </td>
        <td><span class="zone-badge">${rule.service}</span></td>
        <td>${actionBadge}</td>
        <td style="text-align:center;"><button type="button" class="btn-delete" data-rule-idx="${idx}">Delete</button></td>
      `;
      elRuleTableBody.appendChild(tr);
    });

    elRuleTableBody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-rule-idx'));
        const activeFw = getActiveFirewall();
        if (activeFw && activeFw.security_policies) {
          activeFw.security_policies.splice(idx, 1);
          renderRuleTable();
          updateConfigPreviews();
        }
      });
    });
  }

  // Render NAT Policies Table
  function renderNatRuleTable() {
    const elNatTableBody = document.getElementById('natTableBody');
    if (!elNatTableBody) return;
    elNatTableBody.innerHTML = '';
    
    const activeFw = getActiveFirewall();
    const rules = activeFw?.nat_policies || [];

    if (rules.length === 0) {
      elNatTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);font-style:italic;">No NAT Rules Configured.</td></tr>`;
      return;
    }

    rules.forEach((rule, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600;">${rule.name}</td>
        <td>
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span>From: <span class="zone-badge">${rule.from_zone}</span></span>
            <span>To: <span class="zone-badge">${rule.to_zone}</span></span>
          </div>
        </td>
        <td>
          <div style="display:flex;flex-direction:column;gap:2px;font-family:var(--font-mono);font-size:0.75rem;">
            <span>Src: <strong>${rule.source}</strong></span>
            <span>Dst: <strong>${rule.destination}</strong></span>
            <span>Port: <strong>${rule.service}</strong></span>
          </div>
        </td>
        <td>
          <div style="display:flex;flex-direction:column;gap:2px;font-family:var(--font-mono);font-size:0.75rem;">
            <span>IP: <strong>${rule.translated_ip}</strong></span>
            <span>Port: <strong>${rule.translated_port}</strong></span>
          </div>
        </td>
        <td style="text-align:center;"><button type="button" class="btn-delete" data-nat-idx="${idx}">Delete</button></td>
      `;
      elNatTableBody.appendChild(tr);
    });

    elNatTableBody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-nat-idx'));
        const activeFw = getActiveFirewall();
        if (activeFw && activeFw.nat_policies) {
          activeFw.nat_policies.splice(idx, 1);
          renderNatRuleTable();
          updateConfigPreviews();
        }
      });
    });
  }

  // Add Address Object Handler
  if (elBtnAddAddrObj) {
    elBtnAddAddrObj.addEventListener('click', () => {
      const name = elAddrObjName.value.trim().replace(/\s+/g, '_');
      const type = elAddrObjType.value;
      const value = elAddrObjValue.value.trim();

      if (!name) {
        alert("Please enter Address Object Name.");
        return;
      }
      if (!value) {
        alert("Please enter Address Object Value.");
        return;
      }

      if (!state.palo_alto.address_objects) state.palo_alto.address_objects = [];
      if (state.palo_alto.address_objects.some(ao => ao.name === name)) {
        alert(`Address Object "${name}" already exists.`);
        return;
      }

      state.palo_alto.address_objects.push({ name, type, value });
      elAddrObjName.value = '';
      elAddrObjValue.value = '';

      renderAddrObjTable();
      populatePolicySelectors();
      updateConfigPreviews();
    });
  }

  // Add Service Object Handler
  if (elBtnAddSrvObj) {
    elBtnAddSrvObj.addEventListener('click', () => {
      const name = elSrvObjName.value.trim().replace(/\s+/g, '_');
      const protocol = elSrvObjProto.value;
      const port = elSrvObjPort.value.trim();

      if (!name) {
        alert("Please enter Service Object Name.");
        return;
      }
      if (!port) {
        alert("Please enter Destination Port.");
        return;
      }

      if (!state.palo_alto.service_objects) state.palo_alto.service_objects = [];
      if (state.palo_alto.service_objects.some(so => so.name === name)) {
        alert(`Service Object "${name}" already exists.`);
        return;
      }

      state.palo_alto.service_objects.push({ name, protocol, port });
      elSrvObjName.value = '';
      elSrvObjPort.value = '';

      renderSrvObjTable();
      populatePolicySelectors();
      updateConfigPreviews();
    });
  }

  // Add Rule Handler
  if (elBtnAddRule) {
    elBtnAddRule.addEventListener('click', () => {
      const name = elRuleName.value.trim().replace(/\s+/g, '_');
      const action = elRuleAction.value;
      const from_zone = elRuleFromZone.value.trim() || 'any';
      const to_zone = elRuleToZone.value.trim() || 'any';
      const source = elRuleSrcAddrSelect.value;
      const destination = elRuleDstAddrSelect.value;
      const service = elRuleSrvSelect.value;

      if (!name) {
        alert("Please enter Rule Name.");
        return;
      }

      if (!state.palo_alto.security_policies) state.palo_alto.security_policies = [];
      if (state.palo_alto.security_policies.some(r => r.name === name)) {
        alert(`Rule "${name}" already exists.`);
        return;
      }

      state.palo_alto.security_policies.push({
        name, action, from_zone, to_zone, source, destination, service
      });

      elRuleName.value = '';
      elRuleFromZone.value = '';
      elRuleToZone.value = '';
      elRuleSrcAddrSelect.value = 'any';
      elRuleDstAddrSelect.value = 'any';
      elRuleSrvSelect.value = 'any';

      renderRuleTable();
      updateConfigPreviews();
    });
  }

  // --- PALO ALTO POLICY AUDIT EVENT HANDLERS ---
  const elPaloAuditSource = document.getElementById('paloAuditSource');
  const elBtnRunPaloAudit = document.getElementById('btnRunPaloAudit');
  const elBtnDownloadPaloAuditCsv = document.getElementById('btnDownloadPaloAuditCsv');
  const elPaloAuditStatus = document.getElementById('paloAuditStatus');
  const elPaloAuditScorePanel = document.getElementById('paloAuditScorePanel');
  
  const elPaloAuditGrade = document.getElementById('paloAuditGrade');
  const elPaloAuditScore = document.getElementById('paloAuditScore');
  
  const elPaloStatUnused = document.getElementById('paloStatUnused');
  const elPaloStatBroad = document.getElementById('paloStatBroad');
  const elPaloStatLegacy = document.getElementById('paloStatLegacy');
  const elPaloStatRedundant = document.getElementById('paloStatRedundant');
  
  const elPaloAuditTableContainer = document.getElementById('paloAuditTableContainer');
  const elPaloAuditTableBody = document.getElementById('paloAuditTableBody');
  
  const elPaloRemediationContainer = document.getElementById('paloRemediationContainer');
  const elPaloRemediationCli = document.getElementById('paloRemediationCli');
  const elBtnCopyPaloRemediation = document.getElementById('btnCopyPaloRemediation');

  let activeAuditFindings = [];

  if (elBtnRunPaloAudit) {
    elBtnRunPaloAudit.addEventListener('click', async () => {
      const source = elPaloAuditSource.value;
      const activeFw = getActiveFirewall();
      const host = activeFw?.host || '';
      const port = activeFw?.port || 443;
      const username = activeFw?.username || '';
      const password = activeFw?.password || '';

      if (source === 'live') {
        if (!host) {
          alert("Please enter Firewall IP Address / Hostname in the credentials card.");
          return;
        }
        if (!username || !password) {
          alert("Please enter Username and Password in the credentials card.");
          return;
        }
      }

      elBtnRunPaloAudit.disabled = true;
      elBtnRunPaloAudit.textContent = "Auditing...";
      
      elPaloAuditStatus.style.display = 'block';
      elPaloAuditStatus.textContent = source === 'live' 
        ? `Connecting to Palo Alto Firewall at https://${host}:${port}...\nAuthenticating admin user...\nFetching XML security rules and traffic logs...\nRunning policy hit analyzer and shadowed rules validation...\nAudit completed successfully.`
        : `Scanning current GUI Policy Matrix (found ${activeFw?.security_policies?.length || 0} security rules and ${activeFw?.nat_policies?.length || 0} NAT rules)...`;

      try {
        const res = await fetch('/api/paloalto/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host, port, username, password, source,
            mode: activeFw?.mode || 'standalone',
            host_secondary: activeFw?.host_secondary || '',
            rules: activeFw?.security_policies || [],
            nat_policies: activeFw?.nat_policies || []
          })
        });
        const data = await res.json();
        
        if (res.ok) {
          activeAuditFindings = data.findings;
          
          elPaloAuditScorePanel.style.display = 'block';
          elPaloAuditGrade.textContent = data.grade;
          elPaloAuditScore.textContent = `Score: ${data.score}/100`;
          
          elPaloStatUnused.textContent = data.stats.unused;
          elPaloStatBroad.textContent = data.stats.broad;
          elPaloStatLegacy.textContent = data.stats.legacy;
          elPaloStatRedundant.textContent = data.stats.redundant;
          
          if (data.score >= 90) elPaloAuditGrade.style.color = '#10b981';
          else if (data.score >= 70) elPaloAuditGrade.style.color = '#f59e0b';
          else elPaloAuditGrade.style.color = '#ef4444';

          elPaloAuditTableContainer.style.display = 'block';
          elPaloAuditTableBody.innerHTML = '';
          
          if (data.findings.length === 0) {
            elPaloAuditTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);font-style:italic;">No security risks or compliance issues detected! Rule configuration is clean.</td></tr>`;
          } else {
            data.findings.forEach(f => {
              const tr = document.createElement('tr');
              let riskClass = '';
              if (f.risk.includes('❌') || f.risk.includes('Critical')) riskClass = 'style="color:#ef4444;font-weight:600;"';
              else if (f.risk.includes('⚠️')) riskClass = 'style="color:#f59e0b;font-weight:600;"';
              
              tr.innerHTML = `
                <td style="font-weight:600;">${f.name}</td>
                <td><code style="font-family:var(--font-mono);">${f.src_dst}</code></td>
                <td><code style="font-family:var(--font-mono);">${f.service}</code></td>
                <td><span style="font-family:var(--font-sans);font-weight:500;">${f.hits}</span></td>
                <td ${riskClass}>${f.risk}</td>
                <td style="font-size:0.72rem;line-height:1.3;color:var(--text-muted);">${f.recommendation}</td>
              `;
              elPaloAuditTableBody.appendChild(tr);
            });
          }

          elPaloRemediationContainer.style.display = 'block';
          elPaloRemediationCli.value = data.cli;

          elBtnDownloadPaloAuditCsv.disabled = false;
          elPaloAuditStatus.textContent = source === 'live' 
            ? `✅ Live audit completed. Security Grade: ${data.grade} (${data.score}/100) - ${data.findings.length} findings flagged.`
            : `✅ GUI Policy Matrix audit completed. Security Grade: ${data.grade} (${data.score}/100) - ${data.findings.length} findings flagged.`;
        } else {
          throw new Error(data.error || "Failed to complete audit.");
        }
      } catch (err) {
        alert(`❌ Policy Audit failed: ${err.message}`);
        elPaloAuditStatus.textContent = `❌ Audit Error: ${err.message}`;
      } finally {
        elBtnRunPaloAudit.disabled = false;
        elBtnRunPaloAudit.textContent = "⚡ Run Security Audit";
      }
    });
  }

  if (elBtnDownloadPaloAuditCsv) {
    elBtnDownloadPaloAuditCsv.addEventListener('click', () => {
      if (!activeAuditFindings || activeAuditFindings.length === 0) {
        alert("No audit results to export.");
        return;
      }
      
      const headers = ['Rule Name', 'Source/Dest IP', 'Ports/Services', 'Last Hit Timeline', 'Security Risk', 'Recommendation'];
      const rows = activeAuditFindings.map(f => [
        `"${f.name}"`,
        `"${f.src_dst.replace(/➡️/g, '->')}"`,
        `"${f.service}"`,
        `"${f.hits.replace(/⚠️/g, '')}"`,
        `"${f.risk.replace(/⚠️|❌/g, '').trim()}"`,
        `"${f.recommendation.replace(/"/g, '""')}"`
      ]);
      
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `palo_alto_security_audit_${Date.now()}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  if (elBtnCopyPaloRemediation) {
    elBtnCopyPaloRemediation.addEventListener('click', () => {
      if (!elPaloRemediationCli.value || elPaloRemediationCli.value.trim() === '') return;
      navigator.clipboard.writeText(elPaloRemediationCli.value).then(() => {
        elBtnCopyPaloRemediation.textContent = "✅ Copied!";
        setTimeout(() => {
          elBtnCopyPaloRemediation.textContent = "📋 Copy CLI";
        }, 1500);
      }).catch(err => {
        console.error("Failed to copy remediation commands: ", err);
      });
    });
  }

  // --- RAG COPILOT & ASSISTANT SYSTEM HANDLERS ---
  const elCopilotProvider = document.getElementById('copilotProvider');
  const elCopilotModel = document.getElementById('copilotModel');
  const elCopilotApiKey = document.getElementById('copilotApiKey');
  const elApiKeyContainer = document.getElementById('apiKeyContainer');
  const elChromaEndpoint = document.getElementById('chromaEndpoint');
  const elKbSelector = document.getElementById('kbSelector');

  const elBtnIndexKb = document.getElementById('btnIndexKb');
  const elBtnCheckKbStatus = document.getElementById('btnCheckKbStatus');
  const elBtnStartChroma = document.getElementById('btnStartChroma');
  const elCustomChunkContent = document.getElementById('customChunkContent');
  const elBtnAddChunk = document.getElementById('btnAddChunk');

  // PDF Uploader elements
  const elPdfUploadZone = document.getElementById('pdfUploadZone');
  const elPdfFileInput = document.getElementById('pdfFileInput');
  const elPdfFileInfo = document.getElementById('pdfFileInfo');
  const elPdfFileName = elPdfFileInfo ? elPdfFileInfo.querySelector('.file-name') : null;
  const elBtnCancelPdf = document.getElementById('btnCancelPdf');
  const elBtnConvertPdf = document.getElementById('btnConvertPdf');
  const elPdfUploadProgress = document.getElementById('pdfUploadProgress');
  const elPdfProgressBar = document.getElementById('pdfProgressBar');
  const elPdfUploadStatus = document.getElementById('pdfUploadStatus');

  const elChatWindow = document.getElementById('chatWindow');
  const elChatUseRag = document.getElementById('chatUseRag');
  const elChatIncludeGui = document.getElementById('chatIncludeGui');
  const elChatIncludeFiles = document.getElementById('chatIncludeFiles');
  const elCopilotInput = document.getElementById('copilotInput');
  const elBtnSendChat = document.getElementById('btnSendChat');
  const elRagContextPreview = document.getElementById('ragContextPreview');
  const elBtnAnalyzeError = document.getElementById('btnAnalyzeError');

  let selectedPdfFile = null;

  // --- AI PDF UPLOADER & CONVERTER EVENT HANDLERS ---
  if (elPdfUploadZone && elPdfFileInput) {
    elPdfUploadZone.addEventListener('click', () => elPdfFileInput.click());
    
    elPdfFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handlePdfSelection(e.target.files[0]);
      }
    });

    elPdfUploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      elPdfUploadZone.classList.add('drag-over');
    });

    elPdfUploadZone.addEventListener('dragleave', () => {
      elPdfUploadZone.classList.remove('drag-over');
    });

    elPdfUploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      elPdfUploadZone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          handlePdfSelection(file);
        } else {
          alert("Please upload a PDF file only.");
        }
      }
    });
  }

  function handlePdfSelection(file) {
    selectedPdfFile = file;
    if (elPdfFileName) elPdfFileName.textContent = file.name;
    if (elPdfFileInfo) elPdfFileInfo.style.display = 'flex';
    if (elPdfUploadZone) elPdfUploadZone.style.display = 'none';
    if (elBtnConvertPdf) elBtnConvertPdf.disabled = false;
  }

  if (elBtnCancelPdf) {
    elBtnCancelPdf.addEventListener('click', () => {
      selectedPdfFile = null;
      if (elPdfFileInput) elPdfFileInput.value = '';
      if (elPdfFileInfo) elPdfFileInfo.style.display = 'none';
      if (elPdfUploadZone) elPdfUploadZone.style.display = 'flex';
      if (elBtnConvertPdf) elBtnConvertPdf.disabled = true;
      if (elPdfUploadProgress) elPdfUploadProgress.style.display = 'none';
      if (elPdfProgressBar) elPdfProgressBar.style.width = '0%';
    });
  }

  if (elBtnConvertPdf) {
    elBtnConvertPdf.addEventListener('click', async () => {
      if (!selectedPdfFile) return;

      elBtnConvertPdf.disabled = true;
      if (elBtnCancelPdf) elBtnCancelPdf.disabled = true;
      if (elPdfUploadProgress) elPdfUploadProgress.style.display = 'block';
      if (elPdfProgressBar) elPdfProgressBar.style.width = '10%';
      if (elPdfUploadStatus) elPdfUploadStatus.textContent = "Extracting text from PDF...";

      const formData = new FormData();
      formData.append('file', selectedPdfFile);
      formData.append('kb', elKbSelector.value);
      formData.append('provider', elCopilotProvider.value);
      formData.append('model', elCopilotModel.value.trim());
      formData.append('apiKey', elCopilotApiKey.value);
      formData.append('chroma', elChromaEndpoint.value.trim());

      let progress = 10;
      const progressInterval = setInterval(() => {
        if (progress < 85) {
          progress += Math.floor(Math.random() * 5) + 2;
          if (elPdfProgressBar) elPdfProgressBar.style.width = `${progress}%`;
          if (elPdfUploadStatus) {
            if (progress > 25 && progress <= 55) {
              elPdfUploadStatus.textContent = "AI re-structuring guide text to Markdown...";
            } else if (progress > 55) {
              elPdfUploadStatus.textContent = "Writing and indexing segments into vector KB...";
            }
          }
        }
      }, 1500);

      try {
        const res = await fetch('/api/kb/upload-pdf', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        
        clearInterval(progressInterval);

        if (res.ok) {
          if (elPdfProgressBar) elPdfProgressBar.style.width = '100%';
          if (elPdfUploadStatus) elPdfUploadStatus.textContent = "✅ Indexed Successfully!";
          alert(`🎉 Successfully processed PDF guide!\n\nDocument: ${data.filename}\nPages read: ${data.pages}\nIngestion Mode: ${data.mode}\n\nChromaDB has been re-indexed. You can now chat about this document!`);
          
          appendChatMessage('assistant', `📚 **I have imported and indexed a new network guide!**\n\n* **Document Name:** \`${data.filename}\`\n* **Pages processed:** ${data.pages}\n* **Import Mode:** ${data.mode}\n\nI chunked the document and populated your RAG database. You can ask me technical questions or config generation playbooks based on this document immediately.`);
          
          setTimeout(() => {
            selectedPdfFile = null;
            if (elPdfFileInput) elPdfFileInput.value = '';
            if (elPdfFileInfo) elPdfFileInfo.style.display = 'none';
            if (elPdfUploadZone) elPdfUploadZone.style.display = 'flex';
            if (elBtnConvertPdf) elBtnConvertPdf.disabled = true;
            if (elBtnCancelPdf) elBtnCancelPdf.disabled = false;
            if (elPdfUploadProgress) elPdfUploadProgress.style.display = 'none';
            if (elPdfProgressBar) elPdfProgressBar.style.width = '0%';
          }, 3000);
        } else {
          throw new Error(data.error || "Failed to convert PDF.");
        }
      } catch (err) {
        clearInterval(progressInterval);
        if (elPdfProgressBar) elPdfProgressBar.style.width = '0%';
        if (elPdfUploadStatus) elPdfUploadStatus.textContent = "❌ Conversion Failed";
        alert(`❌ PDF Conversion & Indexing Failed:\n\n${err.message}`);
        elBtnConvertPdf.disabled = false;
        if (elBtnCancelPdf) elBtnCancelPdf.disabled = false;
      }
    });
  }

  // Toggle API Key field visibility
  if (elCopilotProvider) {
    elCopilotProvider.addEventListener('change', () => {
      const provider = elCopilotProvider.value;
      if (provider === 'gemini' || provider === 'openrouter') {
        elApiKeyContainer.style.display = 'block';
        if (provider === 'gemini') {
          elCopilotModel.value = 'gemini-2.5-flash';
        } else {
          elCopilotModel.value = 'anthropic/claude-3.5-sonnet';
        }
      } else {
        elApiKeyContainer.style.display = 'none';
        elCopilotModel.value = 'qwen2.5:7b';
      }
    });
  }

  // Check Knowledge Base Reachability Status
  if (elBtnCheckKbStatus) {
    elBtnCheckKbStatus.addEventListener('click', async () => {
      const chroma = elChromaEndpoint.value.trim();
      const kb = elKbSelector.value;
      
      elBtnCheckKbStatus.disabled = true;
      elBtnCheckKbStatus.textContent = "Checking...";

      try {
        const res = await fetch(`/api/kb/status?chroma=${encodeURIComponent(chroma)}&kb=${kb}`);
        const data = await res.json();
        
        if (data.connected) {
          alert(`✅ Vector database connected successfully!\n\nChromaDB Status: Reachable\nCollection: ${data.collection}\nDocument chunks count: ${data.count}\nFallback Mode: No (Using ChromaDB)`);
        } else {
          alert(`⚠️ Vector database connected in Fallback mode!\n\nChromaDB Status: Unreachable (Offline)\nCollection: ${data.collection}\nFallback JSON path: database/kb_store.json\nDocument chunks count: ${data.count}\nFallback Mode: Yes (Local search active)`);
        }
      } catch (err) {
        alert(`❌ Connection check failed: ${err.message}`);
      } finally {
        elBtnCheckKbStatus.disabled = false;
        elBtnCheckKbStatus.textContent = "🔌 Status";
      }
    });
  }

  // Start ChromaDB Service locally
  if (elBtnStartChroma) {
    elBtnStartChroma.addEventListener('click', async () => {
      const endpoint = elChromaEndpoint.value.trim() || 'http://localhost:8000';
      elBtnStartChroma.disabled = true;
      elBtnStartChroma.textContent = "⚡ Starting...";
      
      appendTerminalLine(`\n> Attempting to launch ChromaDB service locally...`, "system");
      
      try {
        const res = await fetch('/api/chromadb/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chroma: endpoint })
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
          appendTerminalLine(`> Success: ${data.message}`, "success");
          alert(`🎉 ${data.message}`);
          
          if (elBtnCheckKbStatus) elBtnCheckKbStatus.click();
        } else {
          throw new Error(data.error || "Failed to start ChromaDB service.");
        }
      } catch (err) {
        appendTerminalLine(`> Error: ${err.message}`, "failed");
        alert(`❌ Failed to start ChromaDB: ${err.message}`);
      } finally {
        elBtnStartChroma.disabled = false;
        elBtnStartChroma.textContent = "⚡ Start";
      }
    });
  }

  // Index Markdown Files
  if (elBtnIndexKb) {
    elBtnIndexKb.addEventListener('click', async () => {
      const chroma = elChromaEndpoint.value.trim();
      
      elBtnIndexKb.disabled = true;
      elBtnIndexKb.textContent = "Indexing...";

      try {
        const res = await fetch('/api/kb/index', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chroma,
            provider: elCopilotProvider.value,
            model: elCopilotModel.value.trim(),
            apiKey: elCopilotApiKey.value
          })
        });
        const data = await res.json();
        
        if (res.ok) {
          alert(`✅ Knowledge Base indexing completed successfully!\n\nCisco chunks indexed: ${data.cisco_count}\nPalo Alto chunks indexed: ${data.paloalto_count}\nDatabase mode: ${data.mode}`);
        } else {
          throw new Error(data.error || "Failed to index files.");
        }
      } catch (err) {
        alert(`❌ Indexing failed: ${err.message}`);
      } finally {
        elBtnIndexKb.disabled = false;
        elBtnIndexKb.textContent = "🔄 Index Markdown Files";
      }
    });
  }

  // Add Custom Chunk
  if (elBtnAddChunk) {
    elBtnAddChunk.addEventListener('click', async () => {
      const chroma = elChromaEndpoint.value.trim();
      const kb = elKbSelector.value;
      const content = elCustomChunkContent.value.trim();

      if (!content) {
        alert("Please paste text content into the chunk area.");
        return;
      }

      elBtnAddChunk.disabled = true;
      elBtnAddChunk.textContent = "Adding...";

      try {
        const res = await fetch('/api/kb/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chroma,
            kb,
            content,
            provider: elCopilotProvider.value,
            model: elCopilotModel.value.trim(),
            apiKey: elCopilotApiKey.value
          })
        });
        const data = await res.json();
        
        if (res.ok) {
          alert("✅ Custom chunk inserted into RAG database successfully!");
          elCustomChunkContent.value = '';
        } else {
          throw new Error(data.error || "Failed to insert custom chunk.");
        }
      } catch (err) {
        alert(`❌ Insert failed: ${err.message}`);
      } finally {
        elBtnAddChunk.disabled = false;
        elBtnAddChunk.textContent = "+ Insert Chunk";
      }
    });
  }

  // Append a message bubble to the Chat window
  function appendChatMessage(sender, text, hasCode = false, targetFile = '') {
    const wrapper = document.createElement('div');
    wrapper.className = `chat-message ${sender}`;

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    // Parse Markdown code blocks simply
    if (sender === 'assistant') {
      // Find code blocks inside ```
      const parts = text.split(/(```[\s\S]*?```)/g);
      parts.forEach(part => {
        if (part.startsWith('```')) {
          const match = part.match(/```(\w+)?\n([\s\S]*?)```/);
          const lang = match ? match[1] || 'text' : 'text';
          const code = match ? match[2] : part.slice(3, -3);

          const pre = document.createElement('pre');
          const codeEl = document.createElement('code');
          codeEl.className = `language-${lang}`;
          codeEl.textContent = code;
          pre.appendChild(codeEl);
          bubble.appendChild(pre);

          // Render copy and apply actions
          const actions = document.createElement('div');
          actions.className = 'chat-code-actions';

          // Copy Button
          const btnCopy = document.createElement('button');
          btnCopy.className = 'btn-chat-action';
          btnCopy.innerHTML = '📋 Copy';
          btnCopy.addEventListener('click', () => {
            navigator.clipboard.writeText(code);
            btnCopy.innerHTML = '✅ Copied!';
            setTimeout(() => { btnCopy.innerHTML = '📋 Copy'; }, 2000);
          });
          actions.appendChild(btnCopy);

          // Apply to Playbook Button
          const btnApply = document.createElement('button');
          btnApply.className = 'btn-chat-action apply';
          btnApply.innerHTML = '💾 Apply Config';
          
          let resolvedFile = targetFile;
          if (!resolvedFile) {
            resolvedFile = elKbSelector.value === 'cisco' ? 'deploy_nexus.yml' : 'deploy_palo_alto.yml';
          }

          btnApply.addEventListener('click', async () => {
            btnApply.disabled = true;
            btnApply.innerHTML = 'Applying...';
            try {
              const res = await fetch('/api/copilot/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: resolvedFile, code })
              });
              const data = await res.json();
              if (res.ok) {
                alert(`✅ Applied successfully to: ${resolvedFile}`);
                updateConfigPreviews();
              } else {
                throw new Error(data.error || "Validation failed.");
              }
            } catch (err) {
              alert(`❌ Apply failed: ${err.message}`);
            } finally {
              btnApply.disabled = false;
              btnApply.innerHTML = '💾 Apply Config';
            }
          });
          actions.appendChild(btnApply);
          bubble.appendChild(actions);
        } else {
          const textSpan = document.createElement('span');
          textSpan.innerHTML = part.replace(/\n/g, '<br>');
          bubble.appendChild(textSpan);
        }
      });
    } else {
      bubble.textContent = text;
    }

    wrapper.appendChild(bubble);
    elChatWindow.appendChild(wrapper);
    elChatWindow.scrollTop = elChatWindow.scrollHeight;
  }

  // Send Chat message routine
  async function sendChatMessage() {
    const prompt = elCopilotInput.value.trim();
    if (!prompt) return;

    appendChatMessage('user', prompt);
    elCopilotInput.value = '';

    // Create loader bubble
    const loaderWrapper = document.createElement('div');
    loaderWrapper.className = 'chat-message assistant';
    loaderWrapper.id = 'chatLoaderBubble';
    
    const loaderBubble = document.createElement('div');
    loaderBubble.className = 'chat-bubble';
    loaderBubble.innerHTML = `<div class="chat-loading"><span></span><span></span><span></span></div>`;
    loaderWrapper.appendChild(loaderBubble);
    elChatWindow.appendChild(loaderWrapper);
    elChatWindow.scrollTop = elChatWindow.scrollHeight;

    // RAG Context retrieval
    let ragContext = "";
    if (elChatUseRag.checked) {
      try {
        const chroma = elChromaEndpoint.value.trim();
        const kb = elKbSelector.value;
        const res = await fetch('/api/kb/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chroma,
            kb,
            query: prompt,
            provider: elCopilotProvider.value,
            model: elCopilotModel.value.trim(),
            apiKey: elCopilotApiKey.value
          })
        });
        const data = await res.json();
        
        if (res.ok && data.results && data.results.length > 0) {
          ragContext = data.results.map(r => r.content).join("\n\n");
          elRagContextPreview.style.display = 'block';
          elRagContextPreview.textContent = `📚 RAG Match: Found ${data.results.length} snippets in ${kb.toUpperCase()} KB. Injecting context...`;
        } else {
          elRagContextPreview.style.display = 'none';
        }
      } catch (err) {
        console.error("RAG context query failure:", err);
      }
    } else {
      elRagContextPreview.style.display = 'none';
    }

    // Sync GUI context details
    let guiContext = "";
    if (elChatIncludeGui.checked) {
      guiContext = JSON.stringify(state, null, 2);
    }

    // Sync Server files details
    let filesContext = "";
    if (elChatIncludeFiles.checked) {
      try {
        filesContext = JSON.stringify({
          network_config: elYamlContent.textContent,
          inventory_ini: elIniContent.textContent,
          palo_alto_config: elPaloYamlContent.textContent
        });
      } catch (err) {
        console.error("Files context read failure:", err);
      }
    }

    // Call Copilot Chat endpoint
    try {
      const payload = {
        provider: elCopilotProvider.value,
        model: elCopilotModel.value.trim(),
        apiKey: elCopilotApiKey.value,
        prompt,
        ragContext,
        guiContext,
        filesContext
      };

      const res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      // Remove loader
      const loader = document.getElementById('chatLoaderBubble');
      if (loader) loader.remove();

      if (res.ok) {
        let targetFile = elKbSelector.value === 'cisco' ? 'deploy_nexus.yml' : 'deploy_palo_alto.yml';
        appendChatMessage('assistant', data.response, true, targetFile);
      } else {
        throw new Error(data.error || "Failed to get response from AI model.");
      }
    } catch (err) {
      const loader = document.getElementById('chatLoaderBubble');
      if (loader) loader.remove();
      appendChatMessage('assistant', `❌ ERROR CALLING COPILOT: ${err.message}`);
    }
  }

  if (elBtnSendChat && elCopilotInput) {
    elBtnSendChat.addEventListener('click', sendChatMessage);
    elCopilotInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });
  }

  // --- CONNECT AI DIAGNOSTIC TERMINAL ERROR ANALYZER ---
  if (elBtnAnalyzeError) {
    elBtnAnalyzeError.addEventListener('click', () => {
      // Read last 25 lines from terminal console
      const lines = Array.from(elTerminal.querySelectorAll('.line'));
      const lastLinesText = lines.slice(-25).map(l => l.textContent).join('\n');

      // Swap to copilot tab
      deactivateAllTabs();
      const copilotTabBtn = document.querySelector('[data-tab="copilot-tab"]');
      if (copilotTabBtn) copilotTabBtn.classList.add('active');
      document.getElementById('copilot-tab').classList.add('active');

      // Set input prompt value and trigger send
      elCopilotInput.value = `Explain why this playbook verification/run failed and suggest a fix. Here are the logs:\n\`\`\`text\n${lastLinesText}\n\`\`\``;
      
      // Auto-toggle file syncing context
      elChatIncludeFiles.checked = true;
      elChatIncludeGui.checked = true;

      sendChatMessage();
    });
  }

  // --- OVERRIDE CLEANUP DEPLOYMENT TO DISPLAY AI ERROR ANALYZER BUTTON ---
  const originalCleanupDeployment = cleanupDeployment;
  cleanupDeployment = function() {
    originalCleanupDeployment();

    // Check if the terminal contains failed lines
    const textContent = elTerminal.textContent;
    if (textContent.includes('failed=1') || textContent.includes('failed=') || textContent.includes('fatal:') || textContent.includes('failed:') || textContent.includes('FAILED') || textContent.includes('exit code:')) {
      elBtnAnalyzeError.style.display = 'inline-flex';
    } else {
      elBtnAnalyzeError.style.display = 'none';
    }
  };

  init();
});

