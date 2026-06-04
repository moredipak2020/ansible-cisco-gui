# FabricOrchestra: Cisco Datacenter Automation Console

FabricOrchestra is a premium, web-based datacenter orchestration and automation control center designed to streamline the configuration, simulation, and provisioning of Cisco Nexus (NX-OS) fabrics and downstream Cisco IOS switches. 

The console integrates a modern, real-time GUI frontend with an Ansible automation engine back-end to simplify complex network designs such as Multi-Domain vPC networks, HSRP Virtual Gateways, and L2/L3 downstream aggregates.

---

## 🚀 Key Features

### 1. Datacenter Switch Inventory
*   Dynamic registry of fabric roles: **Leaf Switches** (Primary & Secondary), **Spine Switches**, **Downstream Targets**, and **Standalone Devices**.
*   Management IP mapping and online status detection.

### 2. Multi-Domain vPC Configuration
*   Visual assembly of vPC Leaf Switch pairs.
*   Configures vPC domain IDs, peer-keepalive parameters, and physical interface groupings.
*   Supports multiple downstream vPC channels (LACP aggregates) per domain pair.

### 3. HSRP Gateway Provisioning
*   Defines Layer 3 default gateway Virtual IPs (VIPs) and CIDR subnets.
*   Assigns routing to either vPC domains or Standalone Switches.
*   Configures HSRP priorities, active/standby groups, and preemption parameters.

### 4. Downstream Switch Aggregate & SVI Provisioning
*   **Port-Channels**: Set up physical interface aggregates as trunks on downstream Cisco IOS switches.
*   **SVIs (Layer 3 interfaces)**: Define multiple SVIs per port-channel trunk to facilitate routing over aggregated physical links.

### 5. Verify & Push (Ansible Stream Pipeline)
*   **Live Variable Compiler**: Instantly compiles configurations into structured variables (`vars/network_config.yml`) and host files (`inventory.ini`).
*   **Ansible Simulator Mode**: Runs dry-run mock deployment validations locally and streams real-time color-coded execution logs directly to a web console.
*   **Production Push**: Connects to a local or remote Ansible Control Node via secure SSH tunnels to transfer files, execute playbooks, and provision live devices.

---

## 🏛️ Repository Architecture

*   **`server.js`**: Express.js server backend. Manages local JSON database configuration states (`database/db.json`), compiles Ansible files, and streams log executions via Server-Sent Events (SSE).
*   **`public/`**: Web UI dashboard.
    *   `index.html`: Dashboard structure containing the dynamic views.
    *   `app.js`: State manager, input synchronizers, validation logics, and terminal SSE streaming listeners.
    *   `style.css`: Harmonic theme stylesheet featuring CSS variables and premium glassmorphism layouts.
*   **`deploy_nexus.yml`**: Central Ansible playbook implementing features activation, vPC domain interfaces, L2/L3 SVI mapping, and running configuration persistence.
*   **`cisco_vxlan_rag_database.md`**: Search-optimized local RAG reference database containing NX-OS VXLAN EVPN configuration guidelines, Spine RR setups, Leaf Symmetric IRB configurations, Anycast Gateways, and troubleshooting trees.

---

## 🛠️ Technology Stack

*   **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6)
*   **Backend Node Service**: Express.js, SSH2 SSH client library, JS-YAML parser
*   **Automation Framework**: Ansible Core (running `cisco.nxos` and `cisco.ios` modules)
*   **Database**: File-based local JSON repository (`database/db.json`)

---

## 📦 Getting Started

### Prerequisites
*   Node.js (v16+)
*   Ansible (installed locally or on a remote controller accessible via SSH)

### Installation
1. Clone this repository to your local directory:
   ```bash
   git clone https://github.com/moredipak2020/ansible-cisco-gui.git
   cd ansible-cisco-gui
   ```
2. Install the application dependencies:
   ```bash
   npm install
   ```

### Running the Application
Start the Node web console:
```bash
npm start
```
The console will boot up and be accessible locally at: **`http://localhost:3000`**

---

## 🔍 Verification Commands reference

Use the following commands inside the active console or raw terminals to troubleshoot VXLAN/EVPN or HSRP networks:

*   **NVE Interface State**: `show nve peers` / `show nve vni`
*   **EVPN Route Verification**: `show bgp l2vpn evpn`
*   **Customer VRF Routing**: `show ip route vrf <vrf_name>`
*   **HSRP Gateways**: `show hsrp brief`
*   **Port-Channel Link Aggregates**: `show port-channel summary`
