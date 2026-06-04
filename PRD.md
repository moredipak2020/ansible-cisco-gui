# Product Requirement Document (PRD): FabricOrchestra
*A Modular, Object-Oriented Datacenter Network Automation Dashboard*

---

## 1. Product Vision & Goals

**FabricOrchestra** is an enterprise-grade, web-based network operations console designed to bridge the gap between traditional CLI network administration and modern declarative Infrastructure-as-Code (IaC). 

The platform allows network engineers to configure, manage, and deploy complex leaf-spine datacenter fabrics, vPC configurations, SVI gateways, and HSRP settings through a highly intuitive, premium graphical user interface (GUI), completely abstracting the complexity of raw Ansible playbooks.

### Key Goals:
*   **Modular Build Strategy**: Designed to be built and tested incrementally, feature-by-feature, module-by-module.
*   **Strict Object-Orientation**: Every network entity (Switch, VLAN, Port-Channel, VRF) is a unique object with strict schemas, automatically translated into dynamic YAML variables.
*   **Idempotency & Safety**: Built-in visual dry-run (`--check`) and configuration diff (`--diff`) modules to guarantee network safety before pushing changes.
*   **Scale Ready**: Initiated with local file storage, but architected to seamlessly plug into enterprise sources of truth like **NetBox**.

---

## 2. System Architecture & Tech Stack

To ensure simplicity, high performance, and ease of deployment, the platform is built on a modern, self-contained Javascript stack:

```text
    +-------------------------------------------------------------+
    |                         FRONTEND                            |
    |  - High-Fidelity Glassmorphic HTML5 / Vanilla CSS3 Dashboard |
    |  - Real-Time YAML/INI Dynamic Preview Engine                |
    |  - Reactive State Management (no heavy frameworks)          |
    +-------------------------------------------------------------+
                                  |
                        HTTPS REST / SSE Streams
                                  |
                                  v
    +-------------------------------------------------------------+
    |                         BACKEND                             |
    |  - Node.js Express API Server                               |
    |  - Local JSON database (Object Storage)                     |
    |  - Subprocess Spawner & SSE Log Streamer                     |
    +-------------------------------------------------------------+
                                  |
                       Ansible Engine / CLI Runs
                                  |
                                  v
    +-------------------------------------------------------------+
    |                      NETWORK FABRIC                         |
    |  - Switch Nodes (Cisco Nexus Leaf/Spine, Firewalls, ACI)    |
    +-------------------------------------------------------------+
```

### Tech Stack Details:
1.  **Frontend**: Semantic HTML5, Vanilla CSS3 (using dynamic HSL color systems, custom properties, and micro-animations), and modular ES6 Javascript.
2.  **Backend**: Node.js with Express framework.
3.  **JSON DB**: A lightweight, file-based database (`database/db.json`) storing the network schema.
4.  **Automation Engine**: Ansible Core, running locally or on an Ansible Automation Platform (AAP) agent.

---

## 3. Modular Feature Roadmap (Step-by-Step Build Plan)

To enable systematic, bug-free development, the project is divided into six separate, fully-testable modules. We will build, test, and verify each module before moving to the next.

```text
  [Phase 1: Inventory]  -->  [Phase 2: L2 & HA]  -->  [Phase 3: SVI & Gateway]
  Switches & Credentials     vPC, LACP, Port Groups    VLANs, IPs, HSRP VIPs
           |                           |                           |
           v                           v                           v
  [Phase 6: Deploy Eng] <--  [Phase 5: Firewalls]  <--  [Phase 4: VXLAN EVPN]
  SSE Terminal, Dry-Runs     ACLs, Objects, Rules      Tenant VRFs, L2/L3 VNIs
```

---

### Phase 1: Device Inventory & Management Module (Day 0/1)
*The objective is to establish connection parameters, credentials, and discover device availability.*

*   **GUI Features**:
    *   A clean grid dashboard displaying added Switch nodes.
    *   "Add Node" modal capturing: Hostname, Management IP, Role (Spine, Leaf, Border), Switch Pair allocation.
    *   Centralized SSH Credentials form (Username, Password, Port).
    *   Switch Node connectivity card showing real-time ping/SSH status (Online/Offline badges).
*   **Backend Features**:
    *   API endpoints `/api/devices` (GET, POST, DELETE).
    *   Dynamic generation of `inventory.ini` matching the active database nodes.
    *   OOB ping/ssh reachability verification endpoint `/api/devices/ping`.
*   **Deliverable**: A fully functional switch asset-management dashboard that dynamically generates a valid Ansible inventory.

---

### Phase 2: Layer 2 & High Availability (vPC/LACP) Module (Day 1)
*The objective is to group leaf switches into vPC pairs and provision physical ports into LACP aggregates.*

*   **GUI Features**:
    *   "vPC Pair Creator": Visual map showing Leaf 1 and Leaf 2 linked together with a vPC Domain ID.
    *   "Port Configurator": Dynamic forms to assign physical ports to Port-Channels (e.g. Ethernet1/2-3 to Po10 as vPC Peer-Link).
    *   Downstream Port-Channel builder (Ethernet1/1 to Po100, mapped to vPC ID 100).
*   **Backend Features**:
    *   API endpoints `/api/vpc` and `/api/interfaces`.
    *   Automatic validation: Preventing an interface from being in multiple port-channels; enforcing that a vPC peer-link must be configured before user ports.
*   **Deliverable**: Dynamic generation of L2 interface schemas in `vars/network_config.yml` and loop-based interface provisioning.

---

### Phase 3: Layer 3, SVIs, and Redundancy (HSRP) Module (Day 2)
*The objective is to define IP subnets, VLAN gateways, and HSRP virtual VIP configurations.*

*   **GUI Features**:
    *   "VLAN Database Manager": A dynamic table to add, edit, and delete VLAN IDs and VLAN Names.
    *   "SVI Interface Form": Auto-calculates IP ranges based on CIDR subnet entry. Captures:
        *   Switch 1 SVI IP, Switch 2 SVI IP, Subnet Mask.
        *   HSRP Group ID, HSRP Virtual IP (VIP), and HSRP Active/Standby Priorities.
    *   Interactive VLAN table listing active subnets, default gateways, and master switch roles.
*   **Backend Features**:
    *   API endpoint `/api/vlans`.
    *   Automatic IP validation (verifying Switch IPs and VIP reside inside the entered CIDR range).
*   **Deliverable**: Dynamic addition of subnets and HSRP arrays inside the central YAML variables.

---

### Phase 4: Datacenter Core (VXLAN EVPN) Module (Day 3)
*The objective is to virtualize Layer 2 segments across a Layer 3 routing backbone.*

*   **GUI Features**:
    *   "Tenant VRF Builder": Add, name, and manage dynamic VRFs (Virtual Route Tables).
    *   "VNI Mapping Grid": Simple forms to bind Layer 2 VLAN IDs to Layer 2 VNIs, and Layer 3 VRFs to Layer 3 VNIs.
    *   "EVPN Anycast Gateway Toggle": Globally configure anycast gateway parameters.
*   **Backend Features**:
    *   API endpoint `/api/vxlan`.
    *   Auto-assigns VXLAN Network Identifiers (VNIs) based on standard enterprise numbering rules (e.g., L2 VNI = `30000 + VLAN_ID`).
*   **Deliverable**: Automated generation of complete Leaf-Spine Overlay VXLAN schemas.

---

### Phase 5: Border Security & Firewall Module (Day 4)
*The objective is to manage edge security policies and traffic boundaries.*

*   **GUI Features**:
    *   "Security Object Manager": Create Address Objects (IPs, subnets, FQDNs), Service Objects (port ranges), and dynamic security groups.
    *   "Access Policy Grid": Interactive security policy matrix (Source Zone, Destination Zone, Source IP Group, Destination IP Group, Ports, Action: Allow/Deny).
*   **Backend Features**:
    *   API endpoint `/api/security`.
    *   Generates security matrices for border switches or integrated firewalls (Palo Alto/Fortinet).
*   **Deliverable**: Fully automated generation of ACL databases and security zone rule-packs.

---

### Phase 6: Orchestration, Terminal Console, and Safety Module (All Phases)
*The engine that powers the execution, outputs logging streams, and manages configuration previews.*

*   **GUI Features**:
    *   **Config Preview Panel**: Tabbed code previewer showing generated `inventory.ini` and `vars/network_config.yml` in real time as values are typed.
    *   **Ansible Live Terminal Card**: Glowing console with CRT scanlines streaming live stdout/stderr logs line-by-line with dynamic auto-scrolling.
    *   **Dry-Run / Deploy Toggle**: Double-button cluster:
        *   **"Run Safety Check (Dry-Run)"**: Executes Ansible with `--check --diff` parameters, printing a live diff of what CLI commands will change without pushing.
        *   **"Deploy configuration (Push)"**: Pushes live changes to production switches.
*   **Backend Features**:
    *   API endpoint `/api/deploy` utilizing Server-Sent Events (SSE) to stream subprocesses.
    *   Supports a **Fully Simulated Mode** (for testing GUI workflow offline) and **Real Mode** (using live `ansible-playbook` CLI).

---

## 4. UI/UX & Design Guidelines

FabricOrchestra is a highly premium, modern console designed to deliver an exceptional first-impression visual experience.

*   ** obsidian-Dark Palette**:
    *   Deep Space background: HSL `(224, 71%, 4%)` to HSL `(222, 47%, 11%)`.
    *   Cyber Blue details (Primary): HSL `(199, 89%, 48%)`.
    *   Emerald Green details (Success): HSL `(160, 84%, 39%)`.
    *   Coral Red details (Warnings/Errors): HSL `(343, 81%, 50%)`.
*   **Premium Visual Assets**:
    *   Glassmorphic panels with subtle blur (`backdrop-filter: blur(12px)`) and clean, glowing borders.
    *   Interactive network connection maps showing link states (Primary and Secondary switches glowing when online).
    *   Immersive terminal log viewer with a micro-faded green overlay and diagonal CRT scanline templates.
*   **Dynamic UX Transitions**:
    *   Hover scale expansions on tables and buttons (`transform: scale(1.02)`) with CSS transitions.
    *   Blinking online/offline heartbeat indicators.
    *   Micro-animations showing deployment progress bars as tasks complete.

---

## 5. Security & Access Control Requirements

1.  **Credential Protection**: Switches passwords/SSH keys must never be logged or rendered in clear text. They will be encrypted in the backend.
2.  **State Synchronization**: Double-submit prevention on the "Deploy" button to block simultaneous Ansible runs.
3.  **Audit Trail logs**: Every save/deploy registers a timestamp, the user ID, the target devices, and a copy of the generated configurations in `logs/audit_trail.log`.
