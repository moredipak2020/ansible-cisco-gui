# Graph Report - .  (2026-06-11)

## Corpus Check
- 13 files · ~45,278 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 349 nodes · 380 edges · 32 communities (18 shown, 14 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cisco Switch Fabric & VXLAN|Cisco Switch Fabric & VXLAN]]
- [[_COMMUNITY_Network Automation Textbook Reference|Network Automation Textbook Reference]]
- [[_COMMUNITY_Frontend Console GUI|Frontend Console GUI]]
- [[_COMMUNITY_Cisco Switch Fabric & VXLAN|Cisco Switch Fabric & VXLAN]]
- [[_COMMUNITY_Palo Alto Firewall Automation|Palo Alto Firewall Automation]]
- [[_COMMUNITY_Cisco Switch Fabric & VXLAN|Cisco Switch Fabric & VXLAN]]
- [[_COMMUNITY_Cisco Switch Fabric & VXLAN|Cisco Switch Fabric & VXLAN]]
- [[_COMMUNITY_Local Database State|Local Database State]]
- [[_COMMUNITY_Cisco Switch Fabric & VXLAN|Cisco Switch Fabric & VXLAN]]
- [[_COMMUNITY_Cisco Switch Fabric & VXLAN|Cisco Switch Fabric & VXLAN]]
- [[_COMMUNITY_Node Package Configuration|Node Package Configuration]]
- [[_COMMUNITY_Nexus vPC & HSRP Configurations|Nexus vPC & HSRP Configurations]]
- [[_COMMUNITY_Palo Alto Firewall Automation|Palo Alto Firewall Automation]]
- [[_COMMUNITY_Edge Security & Policy Management|Edge Security & Policy Management]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Palo Alto Firewall Automation|Palo Alto Firewall Automation]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Network Automation Textbook Reference|Network Automation Textbook Reference]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Cisco Switch Fabric & VXLAN|Cisco Switch Fabric & VXLAN]]
- [[_COMMUNITY_Cisco Switch Fabric & VXLAN|Cisco Switch Fabric & VXLAN]]
- [[_COMMUNITY_Cisco Switch Fabric & VXLAN|Cisco Switch Fabric & VXLAN]]
- [[_COMMUNITY_Cisco Switch Fabric & VXLAN|Cisco Switch Fabric & VXLAN]]
- [[_COMMUNITY_Cisco Switch Fabric & VXLAN|Cisco Switch Fabric & VXLAN]]
- [[_COMMUNITY_Cisco Switch Fabric & VXLAN|Cisco Switch Fabric & VXLAN]]
- [[_COMMUNITY_Local Database State|Local Database State]]
- [[_COMMUNITY_Node Package Configuration|Node Package Configuration]]
- [[_COMMUNITY_Edge Security & Policy Management|Edge Security & Policy Management]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Frontend Console GUI|Frontend Console GUI]]
- [[_COMMUNITY_Express API Backend Server|Express API Backend Server]]
- [[_COMMUNITY_Express API Backend Server|Express API Backend Server]]

## God Nodes (most connected - your core abstractions)
1. `Cisco Nexus 9000 Series NX-OS VXLAN Configuration Guide, Release 10.3(x)` - 22 edges
2. `init()` - 18 edges
3. `Table of Contents` - 18 edges
4. `Overview` - 12 edges
5. `getActiveFirewall()` - 10 edges
6. `state` - 9 edges
7. `ansible_server` - 7 edges
8. `3. Modular Feature Roadmap (Step-by-Step Build Plan)` - 7 edges
9. `Cisco NX-OS VXLAN EVPN Local RAG Database & Reference Guide` - 7 edges
10. `Preface` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Enterprise Network Automation PDF Document` --semantically_similar_to--> `Chapter 1: Foundations of Network IaC`  [INFERRED] [semantically similar]
  enterprise_network_automation_textbook.pdf → enterprise_network_automation_textbook.md
- `syncFiles()` --shares_data_with--> `Palo Alto Configuration Variables`  [INFERRED]
  server.js → vars/palo_alto_config.yml
- `syncFiles()` --shares_data_with--> `Palo Alto CLI commands`  [INFERRED]
  server.js → vars/palo_alto_set.txt
- `Automate Palo Alto Networks Firewall Policy Playbook` --semantically_similar_to--> `Palo Alto CLI commands`  [INFERRED] [semantically similar]
  deploy_palo_alto.yml → vars/palo_alto_set.txt
- `Cisco VXLAN RAG Reference Guide` --semantically_similar_to--> `Palo Alto PAN-OS RAG Reference Guide`  [INFERRED] [semantically similar]
  cisco_vxlan_rag_database.md → palo_alto_rag_database.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Palo Alto Networks Policy Automation Pipeline** — server_syncfiles, deploy_palo_alto_playbook, vars_palo_alto_config_yml, vars_palo_alto_set_txt [INFERRED 0.95]
- **AI Copilot Retrieval-Augmented Generation Stack** — server_api_kb_upload_pdf, cisco_vxlan_rag_database_md, palo_alto_rag_database_md [INFERRED 0.85]

## Communities (32 total, 14 thin omitted)

### Community 0 - "Cisco Switch Fabric & VXLAN"
Cohesion: 0.05
Nodes (43): About BGP EVPN Filtering, Audience, Chapter 10: EVPN Hybrid IRB Mode, Chapter 11: EVPN Distributed NAT, Chapter 12: VXLAN Path Validation and Verification, Chapter 14: Interoperability with EVPN Multi-Homing using ESI, Chapter 15: Configure Multi-Site, Chapter 1: New and Changed Information (+35 more)

### Community 1 - "Network Automation Textbook Reference"
Cohesion: 0.05
Nodes (39): Palo Alto Networks Skills, 1.1 Core Definitions, 1.2 The Enterprise Automation Stack, 2.1 Interface & Link Aggregation (LACP), 2.2 High Availability: vPC & HSRP, 4.1 Cisco ACI (Application Centric Infrastructure), 4.2 VMware NSX-T (Virtual Hypervisor Networks), 5.1 Address & Service Objects (+31 more)

### Community 2 - "Frontend Console GUI"
Cohesion: 0.11
Nodes (29): appendChatMessage(), appendTerminalLine(), bindVpcDomainEvents(), getActiveFirewall(), init(), populateDownstreamSwitchSelects(), populatePolicySelectors(), populateStandaloneSwitchSelects() (+21 more)

### Community 3 - "Cisco Switch Fabric & VXLAN"
Cohesion: 0.08
Nodes (29): Leaf Switch Configuration (VTEP with Symmetric IRB), VTEP (Virtual Tunnel Endpoint), Configure vPC and HSRP Playbook, SVI, HSRP, and vPC Configuration Tasks, 3.1 Underlay vs. Overlay, 3.2 Dynamic Tenant & VNI Object Schema, A. The Underlay Network, B. The Overlay Network (+21 more)

### Community 4 - "Palo Alto Firewall Automation"
Cohesion: 0.10
Nodes (22): Automate Palo Alto Networks Firewall Policy Playbook, API Endpoint: /api/config, API Endpoint: /api/kb/upload-pdf, app, callLLM(), chunkMarkdown(), CONFIG_PATH, DB_PATH (+14 more)

### Community 5 - "Cisco Switch Fabric & VXLAN"
Cohesion: 0.10
Nodes (19): 1. Spine Switch Configuration (Route Reflector Role), 1. The EVPN Control Plane (BGP L2VPN EVPN), 1. Top NX-OS Verification Commands, 1. Variables Structure (`vars/vxlan_config.yml`), 2. Ansible Playbook Segment (`vxlan_setup.yml`), 2. Leaf Switch Configuration (VTEP with Symmetric IRB & Anycast Gateway), 2. Troubleshooting Decision Tree, 2. Underlay vs. Overlay (+11 more)

### Community 6 - "Cisco Switch Fabric & VXLAN"
Cohesion: 0.11
Nodes (19): Appendix A: Configuring Bud Node, Appendix B: DHCP Relay in VXLAN BGP EVPN, Appendix C: Configuring Layer 4 - Layer 7 Network Services Integration, Appendix D: Configuring Proportional Multipath for VNF, Appendix E: Configuring ND Suppression, Chapter 16: Configure Tenant Routed Multicast, Chapter 17: VXLAN Cross Connect, Chapter 18: Configuring Q-in-VNI over VXLAN (+11 more)

### Community 7 - "Local Database State"
Cohesion: 0.14
Nodes (18): ansible_server, target, workspace, credentials, host, password, port, username (+10 more)

### Community 8 - "Cisco Switch Fabric & VXLAN"
Cohesion: 0.11
Nodes (18): ACL Options for VXLAN Traffic, ARP Suppression, Chapter 3: Configure VXLAN, Chapter 7: Configure VXLAN with IPv6 in the Underlay (VXLANv6), Configure VXLAN, Configuring VXLAN, Configuring VXLAN Static Tunnels, FCoE/NPV (+10 more)

### Community 9 - "Cisco Switch Fabric & VXLAN"
Cohesion: 0.14
Nodes (14): Cisco Nexus 9000 as Hardware-Based VXLAN Gateway, Control Plane, Distributed Anycast Gateway, Flood-and-Learn Multicast-Based Learning Control Plane, Licensing Requirements, Overlay Network, Overview, Supported Platforms (+6 more)

### Community 10 - "Node Package Configuration"
Cohesion: 0.14
Nodes (13): dependencies, express, express-fileupload, js-yaml, pdf-parse, ssh2, description, main (+5 more)

### Community 11 - "Nexus vPC & HSRP Configurations"
Cohesion: 0.14
Nodes (13): 1. Datacenter Switch Inventory, 2. Multi-Domain vPC Configuration, 3. HSRP Gateway Provisioning, 4. Downstream Switch Aggregate & SVI Provisioning, 5. Verify & Push (Ansible Stream Pipeline), FabricOrchestra: Cisco Datacenter Automation Console, 📦 Getting Started, Installation (+5 more)

### Community 12 - "Palo Alto Firewall Automation"
Cohesion: 0.18
Nodes (10): 1. Address Objects & Groups, 1. Provisioning Address Objects, 2. Provisioning Security Rules, 2. Service Objects & Groups, 3. Security Access Rules, Palo Alto Networks PAN-OS Firewall Local RAG Database & Reference Guide, 📖 SECTION 1: PAN-OS Core Glossary and Security Architecture, 🏛️ SECTION 2: PAN-OS CLI Configuration Templates (+2 more)

### Community 13 - "Edge Security & Policy Management"
Cohesion: 0.25
Nodes (7): 1. Product Vision & Goals, 2. System Architecture & Tech Stack, 4. UI/UX & Design Guidelines, 5. Security & Access Control Requirements, Key Goals:, Product Requirement Document (PRD): FabricOrchestra, Tech Stack Details:

### Community 14 - "Community 14"
Cohesion: 0.25
Nodes (7): 1. What Was Accomplished in This Session, 2. Core Graph Discoveries, 3. Next Steps & Active Queries to Resume, God Nodes (Primary Abstractions), 📊 Graphify Knowledge Graph Built, Session Memory (2026-06-07), Top Surprising Inferred Connections

### Community 15 - "Palo Alto Firewall Automation"
Cohesion: 0.29
Nodes (7): Anycast Gateway, Chapter 13: Configure vPC Multi-Homing, Cisco VXLAN RAG Reference Guide, Symmetric IRB, vPC Multi-Homing, Palo Alto PAN-OS RAG Reference Guide, PAN-OS Security Zones

### Community 16 - "Community 16"
Cohesion: 0.50
Nodes (4): Dipak More Profile, Dipak More's FabricOrchestra Project, UI/UX & Design Guidelines, FabricOrchestra console

### Community 17 - "Network Automation Textbook Reference"
Cohesion: 0.50
Nodes (4): Four-Layer Enterprise Automation Stack, Chapter 1: Foundations of Network IaC, Principle of Idempotency, Enterprise Network Automation PDF Document

## Knowledge Gaps
- **202 isolated node(s):** `target`, `workspace`, `devices`, `vlans`, `vpc_domains` (+197 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Cisco Nexus 9000 Series NX-OS VXLAN Configuration Guide, Release 10.3(x)` connect `Cisco Switch Fabric & VXLAN` to `Cisco Switch Fabric & VXLAN`, `Cisco Switch Fabric & VXLAN`, `Cisco Switch Fabric & VXLAN`, `Cisco Switch Fabric & VXLAN`, `Palo Alto Firewall Automation`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Why does `Repository Architecture` connect `Cisco Switch Fabric & VXLAN` to `Nexus vPC & HSRP Configurations`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `FabricOrchestra HTML Dashboard UI` connect `Cisco Switch Fabric & VXLAN` to `Frontend Console GUI`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **What connects `target`, `workspace`, `devices` to the rest of the system?**
  _204 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Cisco Switch Fabric & VXLAN` be split into smaller, more focused modules?**
  _Cohesion score 0.046511627906976744 - nodes in this community are weakly interconnected._
- **Should `Network Automation Textbook Reference` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Frontend Console GUI` be split into smaller, more focused modules?**
  _Cohesion score 0.1126984126984127 - nodes in this community are weakly interconnected._