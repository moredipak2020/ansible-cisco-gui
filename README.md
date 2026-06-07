# FabricOrchestra: Cisco & Palo Alto Datacenter Automation Console

FabricOrchestra is a premium, web-based datacenter orchestration and automation control center designed to streamline the configuration, simulation, and provisioning of Cisco Nexus (NX-OS) fabrics, downstream Cisco IOS switches, and Palo Alto Networks security firewalls. 

The console integrates a modern, real-time GUI frontend with an Ansible automation engine back-end, a security policy auditing engine, and an AI-powered RAG (Retrieval-Augmented Generation) Network Copilot.

---

## 🏛️ Architecture & System Integration

The following diagram illustrates how the client dashboard, Node.js API server, local RAG/LLM backend, Ansible control node, and target network infrastructure are integrated:

```mermaid
graph TD
    %% Frontend / Client
    subgraph Client ["Client Browser (FabricOrchestra Dashboard)"]
        UI["HTML5 / Vanilla CSS3 / JS Console"]
        Terminal["Orchestration Stream Logger (SSE)"]
        Copilot["RAG Copilot Chat Interface"]
        PDF["AI PDF Drag-and-Drop Ingestor"]
    end

    %% Node.js Backend
    subgraph Backend ["Node.js Express API Server (port 3000)"]
        Router["Express App Router"]
        AST["AST Code Analyzer"]
        Compiler["Ansible YAML/INI Variable Compiler"]
        SSH["SSH2 Client SSH Tunneling Engine"]
        LocalDB["Local File DB (database/db.json)"]
        RAGRouter["RAG Vector Router / Keyword Sync"]
        AuditEngine["Security Policy & NAT Audit Analyzer"]
    end

    %% Vector Database & LLM
    subgraph AI ["AI & Knowledge Base Stack"]
        Chroma["ChromaDB Vector Store (port 8000)"]
        Gemini["Google Gemini (API)"]
        Ollama["Local Ollama (port 11434)"]
        PDFParse["pdf-parse plain-text extractor"]
    end

    %% Ansible Control Node
    subgraph ControlNode ["Ansible Automation Node (Local/Remote Host)"]
        AnsibleEngine["Ansible Core Orchestrator"]
        CiscoPlaybook["deploy_nexus.yml (Cisco vxlan/vPC/HSRP)"]
        PaloPlaybook["deploy_palo_alto.yml (Palo Alto Policies/NAT)"]
        Vars["vars/network_config.yml & vars/palo_alto_config.yml"]
    end

    %% Network Infrastructure
    subgraph Network ["Target Enterprise Infrastructure"]
        CiscoNX["Cisco Nexus Switches (Leaf/Spine Fabric)"]
        CiscoIOS["Downstream L3 Switches / Port-Channels"]
        PaloFW["Palo Alto Firewalls (Standalone / HA Pairs)"]
    end

    %% Client -> Backend
    UI -->|JSON Config Updates| Router
    UI -->|Run Simulation / Deploy| Router
    Terminal <==|Server-Sent Events (SSE) logs| Router
    Copilot -->|Chat query / Provider configs| RAGRouter
    PDF -->|Upload PDF Buffer| Router
    
    %% Backend internal and external integrations
    Router -->|Read/Write state| LocalDB
    Router -->|Compile configuration vars| Compiler
    Router -->|Post configuration payload| AuditEngine
    Router -->|Initiate SSH Deployments| SSH
    Router -->|Extract PDF text| PDFParse
    Router -->|Route RAG indexing/search| RAGRouter
    
    %% RAG & AI integrations
    PDFParse -->|Clean Markdown Chunks| RAGRouter
    RAGRouter -->|Create collections, Add documents, Query| Chroma
    RAGRouter -->|Generate embeddings & Chat prompts| Gemini
    RAGRouter -->|Generate embeddings & Chat prompts| Ollama
    
    %% Backend -> Control Node
    SSH ===>|Transfer playbooks, vars, inventory & run playbook| AnsibleEngine
    Compiler -->|Writes vars & inventory| Vars
    
    %% Control Node -> Targets
    AnsibleEngine -->|Provision fabric via SSH/Netconf| CiscoNX
    AnsibleEngine -->|Provision aggregates| CiscoIOS
    AnsibleEngine -->|Configure security & NAT policies| PaloFW
```

---

## 🚀 Key Features

### 1. Cisco Provisioning & vPC Fabric Builder
*   **Datacenter Switch Inventory**: Registry of fabric roles (Leaf Switches, Spine Switches, Downstream Targets, and Standalone Devices) with management IP tracking.
*   **Multi-Domain vPC Configurations**: Group Leaf Switches into vPC domains, specify peer-keepalive metrics, and design downstream LACP aggregates.
*   **HSRP Gateways**: Provision Layer 3 Default Gateway VIPs, subnet masks, HSRP group IDs, and preemption settings.
*   **Downstream Aggregate Links**: Configure physical aggregates (Port-Channels) and build multiple virtual subinterfaces (SVIs) for trunks.

### 2. Palo Alto Firewall Console
*   **Firewall Devices Inventory**: Add and manage multiple firewalls. Supports **Standalone** and **HA Pair** (Active/Passive) deployment modes. Inputting HA Pair mode dynamically reveals fields for secondary management IPs.
*   **Target Selector Dropdown**: A master dropdown selector situated at the top of the Policies & Objects tab. Switching targets dynamically re-binds the GUI tables (Address/Service Objects, Security Rules, and NAT Rules) to that device profile.
*   **Destination NAT Policy Matrix**: A matrix interface to configure original packet attributes (Zones, Source/Destination IPs, Service ports) against translated destinations (IP address and port forwarding).
*   **Security Policy & NAT Audit**: Audits configured rules against security and traffic baselines:
    *   Flags unused rules (no traffic in 30 days, 6 months, 1 year).
    *   Flags broad IP-to-IP access rules (`any` source/destination) and unrestricted port ranges.
    *   Identifies unencrypted legacy protocols (HTTP, Telnet, FTP, SMB) crossing security zones.
    *   Identifies shadowed and redundant policies overridden by preceding rules.
*   **Remediation & Compliance Report**: Computes a dynamic Security Health Grade (A to F) and Score (0 to 100), outputs copy-pastable CLI remediation commands, and exports compliance reports to CSV.

### 3. AI-Powered Network RAG Copilot
*   **Vector Search & Fallback**: Integrates ChromaDB v2 for semantic indexing of Cisco VXLAN and Palo Alto configuration databases. Automatically falls back to local JSON keyword search if the database is offline.
*   **AI PDF Ingestor**: Drag-and-drop PDF configuration textbooks or device manuals, extract text, restructure contents using generative models (Gemini/Ollama/OpenRouter), and index them into the RAG system.
*   **Direct Playbook Editing**: AI-suggested playbooks or configurations render with a **Apply Config** button to write code directly to the workspace with automated YAML validation.
*   **ChromaDB Daemon Launcher**: Start ChromaDB directly from the RAG settings panel via a **⚡ Start** button which spawns the background service and verifies its active heartbeat.

### 4. Verify & Push Engine
*   **Real-time Variables Compiler**: Compiles configurations instantly into Ansible YAML variables (`vars/network_config.yml`, `vars/palo_alto_config.yml`) and INI templates.
*   **Ansible Simulator**: Execute dry-run verifications locally and stream real-time console logger outputs directly to the UI terminal.
*   **Remote Production Deploy**: Create secure SSH tunnels to transfer files and execute playbooks directly on local or remote Ansible control hosts.

---

## 🏛️ Repository Structure

*   **`server.js`**: Backend Express.js web server. Coordinates credentials configurations, handles database configurations, processes security policy audits, indexes RAG manuals, and manages child processes.
*   **`public/`**: Frontend single-page application.
    *   `index.html`: UI layout structured into Cisco, Palo Alto (Policies/Audit), and RAG Copilot views.
    *   `app.js`: Client-side logic controller. Synchronizes inputs, builds configuration previews, renders state tables, and handles SSE terminal streaming.
    *   `style.css`: Harmonized dark cyber-obsidian styling framework with responsive grids.
*   **`deploy_nexus.yml`**: Ansible playbook implementing Cisco vPC, HSRP, and downstream interface configurations.
*   **`deploy_palo_alto.yml`**: Ansible playbook deploying Address Objects, Service Objects, Access Policies, and NAT Rules on PAN-OS devices.
*   **`cisco_vxlan_rag_database.md`**: Chunked knowledge base file holding Cisco Nexus fabric architectures.
*   **`palo_alto_rag_database.md`**: Chunked knowledge base file holding Palo Alto configuration guidelines.

---

## 🛠️ Technology Stack

*   **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6)
*   **Backend Node Service**: Express.js, SSH2, JS-YAML, pdf-parse
*   **AI Stack / Vector DB**: ChromaDB v2, Google Gemini API, Local Ollama, OpenRouter
*   **Automation Framework**: Ansible Core (executing `cisco.nxos`, `cisco.ios`, and `paloaltonetworks.panos` collections)
*   **Database**: JSON file repository (`database/db.json`)

---

## 📦 Getting Started

### Prerequisites
*   Node.js (v16+)
*   Python 3.10+ (for ChromaDB vector store)
*   Ansible Core

### Installation
1. Clone this repository:
   ```bash
   git clone https://github.com/moredipak2020/ansible-cisco-gui.git
   cd ansible-cisco-gui
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Install Python dependencies (for ChromaDB):
   ```bash
   pip install chromadb
   ```

### Running the System
1. Start the Node console:
   ```bash
   npm start
   ```
2. Open your browser and go to: **`http://localhost:3000`**
3. Open the **RAG Copilot** tab and click **⚡ Start** next to the ChromaDB Endpoint to spin up the local vector database.

---

## 🔍 Verification Commands Reference

Use the following commands inside the active console or raw terminals to troubleshoot networks:

*   **NVE Interface State**: `show nve peers` / `show nve vni`
*   **EVPN Route Verification**: `show bgp l2vpn evpn`
*   **Customer VRF Routing**: `show ip route vrf <vrf_name>`
*   **HSRP Gateways**: `show hsrp brief`
*   **Port-Channel Link Aggregates**: `show port-channel summary`
*   **Palo Alto active policies**: `show running security-policy`
*   **Palo Alto NAT configurations**: `show running nat-policy`
