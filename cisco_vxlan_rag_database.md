# Cisco NX-OS VXLAN EVPN Local RAG Database & Reference Guide

This document serves as a comprehensive, search-optimized, local RAG-style database for Cisco Nexus 9000 Series Switches running NX-OS. It compiles architectural fundamentals, underlay/overlay configuration templates, Ansible automation strategies, and advanced troubleshooting checklists based on Cisco Official Configuration Guides (Release 10.3x) and Support Documents.

---

## 📖 SECTION 1: VXLAN & EVPN Glossary and Terminology

To search or retrieve terms, use standard string matching on this section.

| Term | Definition | NX-OS Scope / Commands |
| :--- | :--- | :--- |
| **VTEP** | **Virtual Tunnel Endpoint**: The physical switch (Leaf) that performs VXLAN encapsulation (adding IP-UDP headers) and de-encapsulation (removing them) for overlay traffic. | Loopback interface under `interface nve1` |
| **VNI** | **VXLAN Network Identifier**: A 24-bit segment ID in the VXLAN header defining a specific broadcast domain. Supports up to 16 Million segments (versus 4096 in standard VLANs). | `member vni <vni-id>` under NVE |
| **L2VNI** | **Layer 2 VNI**: A VXLAN network identifier mapped to a traditional VLAN, carrying bridged L2 frames between VTEPs. | `vlan <vlan-id>` mapped to `vn-segment <vni-id>` |
| **L3VNI** | **Layer 3 VNI**: A VXLAN network identifier mapped to a VRF, used for routed traffic between different subnets across VTEPs (Symmetric IRB). | `vrf context <vrf-name>` mapped to `vni <l3-vni-id>` |
| **NVE** | **Network Virtual Interface**: The logical software interface on NX-OS switches where VXLAN encapsulation and de-encapsulation are configured. | `interface nve1` |
| **EVPN** | **Ethernet Virtual Private Network**: The BGP-based control plane used to exchange MAC and IP address reachability information between VTEPs, eliminating data-plane flooding. | `address-family l2vpn evpn` under BGP |
| **IRB** | **Integrated Routing and Bridging**: The architecture enabling VTEPs to both bridge L2 traffic and route L3 traffic. Standardized as **Symmetric IRB** in modern EVPN fabrics. | Requires mapping an L3VNI per VRF |
| **Anycast Gateway** | A common gateway IP and MAC address configured across all Leaf VTEPs, allowing virtual machines to migrate between hosts without changing gateways. | `ip virtual-router-are-mac` and `ip address <ip> tag` |
| **BUM Traffic** | **Broadcast, Unknown Unicast, and Multicast**: Traffic that must be flooded to all endpoints in a VNI. Handled via Multicast replication (Underlay) or Ingress Replication (Unicast). | `mcast-group <multicast-ip>` or `ingress-replication` |
| **Symmetric IRB** | A routing methodology where both ingress and egress VTEPs perform both bridging and routing. Traffic travels across the fabric over a transit L3VNI. | `member vni <L3VNI> associate-vrf` |

---

## 🏛️ SECTION 2: VXLAN EVPN Architectural Reference

### 1. The EVPN Control Plane (BGP L2VPN EVPN)
Rather than relying on flood-and-learn data-plane learning, modern Cisco VXLAN implementations use **Multiprotocol BGP (MP-BGP)** to distribute MAC and IP reachability.
- **Route Type 2 (MAC/IP Advertisement Route)**: Used to advertise MAC addresses, IP addresses, and their association to L2VNIs.
- **Route Type 3 (Inclusive Multicast Ethernet Tag Route)**: Used for dynamic discovery of VTEP peers and establishing tunnels for BUM traffic replication.
- **Route Type 5 (IP Prefix Route)**: Used to advertise external subnets or host prefixes associated with L3VNIs.

### 2. Underlay vs. Overlay
- **Underlay (Transport)**: The physical IP network connecting Leaf and Spine switches. Its sole purpose is to provide highly resilient L3 reachability between VTEP loopbacks (using OSPF, IS-IS, or eBGP) and support multicast (PIM-SM) for BUM traffic replication.
- **Overlay (Service)**: The logical L2/L3 tunnels running over the underlay, carrying customer packets encapsulated in VXLAN.

---

## 🛠️ SECTION 3: NX-OS VXLAN EVPN Configuration Templates

### 1. Spine Switch Configuration (Route Reflector Role)
Spines serve as BGP Route Reflectors (RR) for the Leaf VTEPs. They do not encapsulate traffic (no NVE interface) but distribute EVPN routes.

```nx-os
! Enable required features
feature ospf
feature bgp

! Configure OSPF Underlay
router ospf 1
  router-id 192.168.1.100

interface Ethernet1/1
  no switchport
  ip address 192.168.1.1/30
  ip router ospf 1 area 0.0.0.0
  no shutdown

interface loopback0
  ip address 192.168.1.100/32
  ip router ospf 1 area 0.0.0.0

! Configure MP-BGP EVPN Route Reflector
router bgp 65000
  router-id 192.168.1.100
  address-family l2vpn evpn
    retain route-target all
  template peer LEAF-PEERS
    remote-as 65000
    update-source loopback0
    address-family l2vpn evpn
      route-reflector-client
      send-community both
  
  ! Neighbors (Leaf VTEPs)
  neighbor 192.168.2.2
    inherit peer LEAF-PEERS
  neighbor 192.168.2.3
    inherit peer LEAF-PEERS
```

### 2. Leaf Switch Configuration (VTEP with Symmetric IRB & Anycast Gateway)
Leaf switches host client workloads and encapsulate L2/L3 frames across NVE tunnels.

```nx-os
! Enable required features
feature ospf
feature bgp
feature interface-vlan
feature vn-segment-vlan-based
feature nv overlay
nv overlay evpn
feature fabric forwarding       ! Enables Host Mobility Manager for Anycast Gateway

! Configure Anycast Gateway MAC
fabric forwarding anycast-gateway-mac 0000.1111.1111

! Configure VRF and L3VNI association
vrf context Tenant_A
  vni 50000
  rd auto
  address-family ipv4 unicast
    route-target both auto
    route-target both auto evpn

! Define VLANs and Map to VNIs
vlan 10
  name Web_Tier
  vn-segment 10010     ! L2VNI

vlan 999
  name Tenant_A_Transit
  vn-segment 50000     ! L3VNI (Associated with VRF Tenant_A)

! Configure SVI Interfaces
interface Vlan10
  no shutdown
  vrf member Tenant_A
  ip address 10.10.10.252/24
  ip virtual-router address 10.10.10.254  ! Anycast IP shared on all Leafs

interface Vlan999
  no shutdown
  vrf member Tenant_A
  ip forward            ! Enables L3 routing on transit VLAN without IP

! Configure Loopbacks for VTEP
interface loopback0
  description Router ID
  ip address 192.168.2.2/32
  ip router ospf 1 area 0.0.0.0

interface loopback1
  description VTEP NVE Source
  ip address 192.168.3.2/32
  ip router ospf 1 area 0.0.0.0

! Configure NVE Overlay Interface
interface nve1
  no shutdown
  source-interface loopback1
  host-reachability protocol bgp
  
  ! Map L2VNI
  member vni 10010
    mcast-group 224.1.1.1
  
  ! Map L3VNI (Associate VRF Tenant_A)
  member vni 50000 associate-vrf

! Configure BGP EVPN Client
router bgp 65000
  router-id 192.168.2.2
  address-family l2vpn evpn
  neighbor 192.168.1.100
    remote-as 65000
    update-source loopback0
    address-family l2vpn evpn
      send-community both
  vrf Tenant_A
    rd auto
    address-family ipv4 unicast
      redistribute direct
```

### 3. vPC VTEP Configurations (Leaf Peer Pair)
When using a vPC domain as a VTEP, the Leaf peers share a virtual Anycast VTEP IP.

- **VTEP Loopback**: Configure a secondary IP on the NVE source loopback (`loopback1`) that is identical on both vPC VTEPs.
- **Example configuration on loopback1**:
  - `Leaf-1`:
    ```nx-os
    interface loopback1
      ip address 192.168.3.2/32
      ip address 192.168.3.1/32 secondary  ! SHARED VTEP IP
      ip router ospf 1 area 0.0.0.0
    ```
  - `Leaf-2`:
    ```nx-os
    interface loopback1
      ip address 192.168.3.3/32
      ip address 192.168.3.1/32 secondary  ! SHARED VTEP IP
      ip router ospf 1 area 0.0.0.0
    ```
- **NVE Source**: Specify `source-interface loopback1` under `interface nve1`. The NVE interface will automatically advertise secondary IP `192.168.3.1` as the data-plane VTEP address!

---

## 🤖 SECTION 4: Ansible Playbook & Automation Guide

### 1. Variables Structure (`vars/vxlan_config.yml`)
Use standard structured variables to automate Leaf/Spine deployment.

```yaml
---
bgp_asn: 65000
anycast_mac: "0000.1111.1111"
spine_ip: "192.168.1.100"

tenants:
  - name: Tenant_A
    l3vni: 50000
    transit_vlan: 999
    vlans:
      - id: 10
        name: Web_Tier
        l2vni: 10010
        anycast_gateway: "10.10.10.254"
        subnet: "10.10.10.252/24"
        mcast_group: "224.1.1.1"
      - id: 20
        name: App_Tier
        l2vni: 10020
        anycast_gateway: "10.10.20.254"
        subnet: "10.10.20.252/24"
        mcast_group: "224.1.1.1"
```

### 2. Ansible Playbook Segment (`vxlan_setup.yml`)
An example playbook using `cisco.nxos` collections to dynamically provision VXLAN.

```yaml
---
- name: Automate Cisco NX-OS VXLAN EVPN
  hosts: leafs
  gather_facts: no
  vars_files:
    - vars/vxlan_config.yml

  tasks:
    - name: Enable NX-OS Overlay Features
      cisco.nxos.nxos_config:
        lines:
          - feature vn-segment-vlan-based
          - feature nv overlay
          - nv overlay evpn
          - feature fabric forwarding
          - fabric forwarding anycast-gateway-mac {{ anycast_mac }}

    - name: Configure Tenant VRF Context
      cisco.nxos.nxos_config:
        parents: "vrf context {{ item.name }}"
        lines:
          - "vni {{ item.l3vni }}"
          - rd auto
          - address-family ipv4 unicast
          - "  route-target both auto"
          - "  route-target both auto evpn"
      loop: "{{ tenants }}"

    - name: Create Layer 2 VLAN vn-segment mapping
      cisco.nxos.nxos_config:
        parents: "vlan {{ vlan.id }}"
        lines:
          - "name {{ vlan.name }}"
          - "vn-segment {{ vlan.l2vni }}"
      loop: "{{ tenants | selectattr('vlans', 'defined') | map(attribute='vlans') | flatten }}"
      loop_control:
        loop_var: vlan

    - name: Create SVI Anycast Gateways
      cisco.nxos.nxos_config:
        parents: "interface vlan {{ vlan.id }}"
        lines:
          - "vrf member {{ item.name }}"
          - "ip address {{ vlan.subnet }}"
          - "ip virtual-router address {{ vlan.anycast_gateway }}"
          - no shutdown
      loop: "{{ tenants }}"
      loop_control:
        loop_var: item
```

---

## 🔍 SECTION 5: Verification & Troubleshooting Cheat Sheet

### 1. Top NX-OS Verification Commands

| Command | Objective | What to look for |
| :--- | :--- | :--- |
| `show nve peers` | Check data-plane peer state. | `State` should be `Up`. `LearnType` should show `CP` (Control Plane - BGP) or `DP` (Data Plane). |
| `show nve vni` | Verify status of mapped L2/L3 VNIs. | `State` must show `Up`. Type should display `L2 [VLAN]` or `L3 [VRF]`. |
| `show bgp l2vpn evpn` | Check EVPN routes distributed by BGP. | Look for Type-2 (MAC/IP) and Type-5 (Prefix) routes populated from peers. |
| `show ip route vrf <vrf-name>` | Verify routing table inside customer VRF. | Search for route prefixes with `BGP` protocol and next-hop pointing to remote VTEP IP. |
| `show mac address-table vlan <vlan-id>` | View MAC table. | Overlay MACs should point to ports matching `nve1(<peer-vtep-ip>)` with type `dynamic`. |
| `show ip mroute` | Verify multicast distribution tree (PIM-SM). | Verify that dynamic `(*,G)` and `(S,G)` entries for `mcast-group` exist with loopback/physical interface outlets. |

### 2. Troubleshooting Decision Tree

```mermaid
flowchart TD
    A[Issue: Workloads cannot communicate across fabric] --> B{Step 1: Is underlay reachability up?}
    B -- No --> C[Action: Troubleshoot OSPF/IS-IS. Check underlay interface IP/PIM sparse-mode status.]
    B -- Yes --> D{Step 2: Is the NVE interface up?}
    D -- No --> E[Action: Check source loopback routing and verify 'no shutdown' under interface nve1.]
    D -- Yes --> F{Step 3: Are NVE peers discovered?}
    F -- No --> G[Action: Verify that BGP L2VPN EVPN peering is established. Check 'host-reachability protocol bgp' on nve.]
    F -- Yes --> H{Step 4: Are MACs/IPs learned in EVPN?}
    H -- No --> I[Action: Check route-target import/export on Leaf VRF. Verify clients are sending ARP to Leaf.]
    H -- Yes --> J[Status: Control Plane is healthy. Check MTU issues (Jumbo frames 9216 recommended on underlay).]
```

### 3. Common Troubleshooting Scenarios

#### Scenario A: BGP EVPN Peers are Established but `show nve peers` is Empty
- **Cause**: Data-plane tunnel is established dynamically only when client traffic is initiated.
- **Resolution**: Initiate a ping from a client workload (host) to trigger ARP and traffic generation. The tunnel will build instantly.

#### Scenario B: Anycast Gateway Subnet is unreachable between hosts on different Leafs
- **Cause**: Traditional STP blocking transit L2VNI packets or MTU mismatch.
- **Resolution**:
  - Verify that the underlay switches have MTU set to at least `9216` (`mtu 9216` on physical ports). VXLAN encapsulation adds 50 bytes of overhead to the original L2 frame.
  - Verify that client VLAN VNID mapping is consistent across all Leaf VTEPs.


---

## 📚 Imported Guide: cisco-nexus-9000-series-nx-os-vxlan-configuration-guide-release-103x

# Cisco Nexus 9000 Series NX-OS VXLAN Configuration Guide, Release 10.3(x)

**First Published:** 2022-08-19  
**Last Modified:** 2024-05-09  

**Americas Headquarters**  
Cisco Systems, Inc.  
170 West Tasman Drive  
San Jose, CA 95134-1706  
USA  
[http://www.cisco.com](http://www.cisco.com)  
Tel: 408 526-4000  
800 553-NETS (6387)  
Fax: 408 527-0883  

---

## Preface

* Audience
* Document Conventions
* Related Documentation for Cisco Nexus 9000 Series Switches
* Documentation Feedback
* Communications, Services, and Additional Information
* Cisco Bug Search Tool

---

## Chapter 1: New and Changed Information

* New and Changed Information

---

## Chapter 2: Overview

* Licensing Requirements
* Supported Platforms
* VXLAN Overview
* Cisco Nexus 9000 as Hardware-Based VXLAN Gateway
* VXLAN Encapsulation and Packet Format
* VXLAN Tunnel
* VXLAN Tunnel Endpoint
* Underlay Network
* Overlay Network
* Distributed Anycast Gateway
* Control Plane

---

## Chapter 3: Configure VXLAN

### Guidelines and Limitations for VXLAN
* VXLAN deployment requirements and platform support
* vPC Considerations for VXLAN Deployment
* VXLAN network requirements
* VXLAN transport network configuration requirements
* Nested VXLAN overlays

### Configuring VXLAN
* Enabling VXLAN functionality
* Map a VLAN to a VXLAN VNI
* Create and configure an NVE interface and associate VNIs
* Configure a VXLAN VTEP in vPC
* Configure static MAC for VXLAN VTEP
* Disable VXLANs
* Configure BGP EVPN ingress replication
* Configure static ingress replication
* VXLAN and IP-in-IP tunnels

### Configuring VXLAN Static Tunnels
* VXLAN static tunnels
* Supported platforms and limitations for VXLAN static tunnels
* Enable VXLAN static tunnels
* Configure a VRF overlay for static tunnels
* Configure a VRF for VXLAN routing
* Configure the L3 VNI for static tunnels
* Configure the tunnel profile
* Verify VXLAN static tunnels
* VXLAN static tunnel configuration example

---

## Chapter 4: Configuring the Underlay

### IP Fabric Underlay
* Underlay Considerations
* Unicast routing and IP addressing options
* OSPF Underlay IP Network
* IS-IS Underlay IP Network
* eBGP Underlay IP Network

### VXLAN EVPN Programmable Fabric Multicast Routing Support
* PIM ASM and PIM Bidir Underlay IP Network
* Configure PIM ASM
* Verify PIM ASM Configuration
* PIM Bidirectional (BiDir)
* Configure PIM and Phantom RP on Leaf and Spine Switches
* Verify PIM BiDir Configuration
* Underlay Deployment Without Multicast (Ingress Replication)

---

## Chapter 5: Configure VXLAN BGP EVPN

### VXLAN BGP EVPN Overview
* Auto-derived route distinguishers
* Route-target autos
* Supported features and configuration limits for VXLAN BGP EVPN
* Best practice for configuring new L3VNI mode

### Configuring VXLAN BGP EVPN
* Enable VXLAN
* Configure VLAN and VXLAN VNI
* Configure the new L3VNI mode
* Configure VRF for VXLAN routing
* Configure SVI for core-facing VXLAN routing
* Configure SVI for host-facing VXLAN routing
* Configure the NVE interface and VNIs using multicast
* Configure the delay timer on the NVE interface
* Configure VXLAN EVPN ingress replication
* Configure BGP on the VTEP
* Configure iBGP for EVPN on the spine
* Configure eBGP for EVPN on the spine
* Configure ARP suppression
* Disable VXLANs
* Duplicate host detection mechanisms for IP and MAC addresses
* Configure event history size for L2RIB

### Verifying and Troubleshooting VXLAN BGP EVPN
* Verifying the VXLAN BGP EVPN Configuration
* VXLAN BGP EVPN iBGP topologies
* VXLAN BGP EVPN eBGP topologies
* Sample outputs for EVPN/VXLAN show commands

### VXLAN EVPN with Downstream VNI
* VXLAN EVPN with downstream VNIs
* Asymmetric VNIs
* Shared services VRFs
* Multi-site deployments with asymmetric VNIs
* Supported features for VXLAN EVPN with downstream VNI
* Verification commands for VXLAN EVPN with downstream VNIs

### EVPN Centralized Gateway

---

## Chapter 6: Default Gateway Coexistence of HSRP and Anycast Gateway (VXLAN EVPN)

### Default Gateways in VXLAN EVPN Fabrics
* Best practice for migrating from Classic Ethernet or FabricPath to VXLAN
* Migrate Classic Ethernet or FabricPath to VXLAN
* Configure an external port on a border leaf for migration
* Configure external IP address for migration

---

## Chapter 7: Configure VXLAN with IPv6 in the Underlay (VXLANv6)

### VXLANv6 Deployments
* VXLANv6 vMACs
* VXLANv6 vPC peer keepalives
* VXLANv6 deployment features and limitations

### Configuring VXLANv6
* Configure the VTEP IP address
* Configure vPC for VXLANv6
* VXLANv6 configuration requirements and examples
* Verification commands for VXLANv6

---

## Chapter 8: Configure External VRF Connectivity and Route Leaking

### External VRF Connectivity
* External Layer 3 connections for VXLAN BGP EVPN fabrics
* VXLAN BGP EVPN fabrics and VRF-lite mechanisms
* Guidelines for external VRF connectivity and route leaking
* VXLAN BGP EVPN with eBGP for VRF-lite
* VXLAN BGP EVPN - default-route, route filtering on external connectivity
* VXLAN BGP EVPN with OSPF for VRF-lite

### Route Leaking
* Centralized VRF route-leaking for VXLAN BGP EVPN fabrics
* Recommendation: Centralized VRF route-leaking
* Centralized VRF route-leaking - Shared Internet with custom VRF
* Centralized VRF route-leaking
* Configure Internet VRF on the border node
* Configure a custom VRF on the border node
* Configure a custom VRF context on the border node
* Configure a custom VRF instance in BGP on the border node
* Centralized VRF route-leaking configurations for shared Internet with custom VRF
* Centralized VRF route-leaking - Shared Internet with VRF default
* Centralized VRF route leaks with Shared Internet and VRF default
* Configure VRF default on the border node
* Configure a BGP instance for VRF default on the border node
* Configure a custom VRF on the border node
* Configure a filter to permit prefixes from the default VRF on the border node
* Configure a custom VRF context on the border node
* Configure a custom VRF instance in BGP on the border node
* Centralized VRF route-leaking configuration options

---

## Chapter 9: Configuring BGP EVPN Filtering

### About BGP EVPN Filtering
* Guidelines and Limitations for BGP EVPN Filtering

### Configuring BGP EVPN Filtering
* Configuring the Route Map with Match and Set Clauses
* Matching Based on EVPN Route Type
* Matching Based on MAC Address in the NLRI
* Matching Based on RMAC Extended Community
* Set the RMAC Extended Community
* Set the EVPN Next-Hop IP Address
* Set the Gateway IP Address for Route Type-5
* Applying the Route Map at the Inbound or Outbound Level
* BGP EVPN Filtering Configuration Examples

### Configuring a Table Map
* Configuring a MAC List and a Route Map that Matches the MAC List
* Apply the table map
* Configure and Verify Table Map Filtering for MAC Routes
* Verify BGP EVPN Filtering

---

## Chapter 10: EVPN Hybrid IRB Mode

### EVPN Hybrid IRB Modes
* Supported features and limitations of EVPN hybrid IRB mode
* Configure EVPN hybrid IRB mode

---

## Chapter 11: EVPN Distributed NAT

### EVPN Distributed NAT Overview

---

## Chapter 12: VXLAN Path Validation and Verification

### VXLAN OAM Protocols
* VXLAN OAM Tools
* VXLAN OAM Payloads
* Supported platforms and releases for VXLAN NGOAM
* Configure the VXLAN NGOAM
* Configure an NGOAM profile

### Fault Isolation and Verification Tools
* Ping messages
* Ping validation channels
* Traceroute messages
* Traceroutes in multi-site environments
* Pathtrace messages
* Pathtrace functionalities in single-site deployments
* Pathtrace functionalities in multi-site fabrics
* Comparison of traceroute and pathtrace message
* Best practice for fault isolation and verification tools
* Examples for fault isolation and verification tools
  * Ping Message Examples
  * Traceroute message examples
  * Pathtrace message examples

### Methods for VXLAN EVPN Loop Detection and Mitigation
* Network loops
* VXLAN EVPN loop detection and mitigation
* Supported features and limitations for VXLAN EVPN loop detection and mitigation
* Supported platform and release for VXLAN EVPN loop detection and mitigation
* Configuration requirements for NGOAM Southbound loop detection
* Configure NGOAM Southbound loop detection on Layer-2 interfaces
* Detect loops and bring up ports on demand
* Commands for NGOAM loop detection and mitigation

---

## Chapter 13: Configure vPC Multi-Homing

### vPC Multi-Homing Setup
* Primary IP addresses
* Border PE switches
* DHCP relay configuration in vPC setups
* IP prefix advertisement in vPC setups

---

## Chapter 14: Interoperability with EVPN Multi-Homing using ESI

### VXLAN EVPN Interoperability Mechanisms

---

## Chapter 15: Configure Multi-Site

### VXLAN EVPN Multi-Sites Overview
* VXLAN EVPN multi-sites
* Dual RDs for multi-site
* RP placements in DCI cores
* Supported ESI behavior for EVPN multi-homing and Anycast BGW
* Supported platforms and configuration guidelines for VXLAN EVPN Multi-Site
* Enable VXLAN EVPN Multi-Site
* Configure dual RD support for Multi-Site
* Configure VNI dual mode
* Configure Fabric/DCI link tracking
* Configure fabric external neighbors
* Configure VXLAN EVPN Multi-Site storm control
* EVPN storm control commands for VXLAN Multi-Site environments

### Multi-Site with vPC Support
* Guidelines for configuring Multi-Site with vPC support
* Configure Multi-Site with vPC support
* Multi-Site vPC support verification commands
* Asymmetric VNIs in multi-site deployments

### TRM with Multi-Site
* Tenant routed multicasts with Multi-Site
* Supported platforms, software versions, and features for TRM with Multi-Site
* Configure TRM with Multi-Site
* TRM status in multi-site configurations

---

## Chapter 16: Configure Tenant Routed Multicast

### Tenant Routed Multicast (TRM) Overview
* Tenant routed multicast mixed modes
* Tenant routed multicast with IPv6 overlay
* Multicast flow path visibility for TRM flows
* Features and limitations of Tenant Routed Multicast
* Supported features and limitations of Layer 3 TRM
* Supported features and platforms for Layer 2/Layer 3 TRM (Mixed Mode)
* Supported rendezvous point options by TRM mode
* Options for rendezvous points in TRM deployments
* Configure a rendezvous point inside the VXLAN fabric
* Configure an external rendezvous point
* RP Everywhere with PIM Anycast solution
  * Configure a TRM leaf node for RP Everywhere with PIM Anycast
  * Configure a TRM border leaf node for RP Everywhere with PIM Anycast
  * Configure an external router for RP Everywhere with PIM Anycast
* Features of RP Everywhere with MSDP peering solutions
  * Configure a TRM leaf node for RP Everywhere with MSDP peering
  * Configure a TRM border leaf node for RP Everywhere with MSDP peering
  * Configure an external router for RP Everywhere with MSDP peering
* Configure Layer 3 Tenant Routed Multicast
* Configure TRM on the VXLAN EVPN spine
* Configure TRM in Layer 2 and Layer 3 mixed mode
* Configure Layer 2 Tenant Routed Multicast

## Table of Contents

### Tenant Routed Multicast (TRM)
* Configure TRM with vPC support
* Configure TRM with vPC support on Cisco Nexus 9504-R and 9508-R switches
* Flex stats
* Configure Flex Stats for TRM
* Configure TRM Data MDT
* TRM data MDTs
* Supported platforms and configuration constraints for TRM Data MDT
* Configure TRM Data MDT
* Verification commands for TRM Data MDT configuration

### Chapter 17: VXLAN Cross Connect
* VXLAN cross connect
* How VXLAN cross connect work
* Best practice for configuring VXLAN cross connect
* Supported platform and release of VXLAN cross connect
* Features required for cross connect configuration
* Configure VXLAN cross connect
* Commands for verifying VXLAN cross connect configuration
* Remove a cross connect VNI

### Chapter 18: Configuring Q-in-VNI over VXLAN
* Q-in-VNIs
* Guidelines and Limitations for Q-in-VNI
* Configure the Q-in-VNI
* Selective Q-in-VNIs
* Guidelines and Limitations for Q-in-VNI with L2PT
* Configure the Q-in-VNI with L2PT
* Verify the Q-in-VNI with L2PT Configuration
* Configure Q-in-VNI with LACP Tunneling
* Selective Q-in-VNI with Multiple Provider VLANs
* Guidelines and Limitations for Selective Q-in-VNI with Multiple Provider VLANs
* Configure Selective Q-in-VNI with Multiple Provider VLANs
* Configure QinQ-QinVNI
* QinQ-QinVNIs
* Guidelines and Limitations for QinQ-Q in VNI
* Configure the QinQ-QinVNI

### Chapter 19: Configuring Port VLAN Mapping
* About Translating Incoming VLANs
* Guidelines and Limitations for Port VLAN Mapping
* Configure Port VLAN Mapping on a Trunk Port
* Configure Inner VLAN and Outer VLAN Mapping on a Trunk Port
* About Port Multi-VLAN Mapping
* Guidelines and Limitations for Port Multi-VLAN Mapping
* Configure Port Multi-VLAN Mapping

### Chapter 20: Configuring IGMP Snooping
* Configuring IGMP Snooping Over VXLAN
* IGMP snooping mechanisms over VXLAN
* Guidelines for IGMP snooping over VXLAN
* Configure IGMP snooping over VXLAN

### Chapter 21: Configuring VLANs
* Private VLANs
* Guidelines and Limitations for Private VLANs Over VXLAN
* Configuration Example for Private VLANs

### Chapter 22: Configuring ACL
* Access Control Lists for VXLAN Traffic on Cisco Nexus Switches
* Guidelines and Limitations for VXLAN ACLs
* VXLAN Tunnel Encapsulation Switch
  * Configure the Port ACL on the Access Port on Ingress
  * Configure the VLAN ACL on the Server VLAN
  * Configure the Routed ACL on an SVI on Ingress
  * Routed ACL on the Uplink on Egress
* VXLAN Tunnel Decapsulation Switch
  * Routed ACL on the Uplink on Ingress
  * Port ACL on the Access Port on Egress
  * Configure the VLAN ACL for the Layer 2 VNI Traffic
  * Configure the VLAN ACL for the Layer 3 VNI Traffic
  * Configure the Routed ACL on an SVI on Egress

### Chapter 23: Configuring Secure VXLAN EVPN Multi-Site Using CloudSec
* Secure VXLAN EVPN Multi-Sites
* Key Lifetimes and Hitless Key Rollovers
* Certificate Expirations
* Guidelines and Limitations for Secure VXLAN EVPN Multi-Site Using CloudSec
* Enable CloudSec VXLAN EVPN Tunnel Encryption
* Configure a CloudSec Keychain and Keys
* Configuring CloudSec Certificate Based Authentication Using PKI
  * Attach a Certificate to CloudSec
* Configure the Separate Loopback
* Configure a CloudSec Policy
* Configuring CloudSec Peers
  * Configure the CloudSec Peers
* Enable Secure VXLAN EVPN Multi-Site Using CloudSec on DCI Uplinks
* Verify the Secure VXLAN EVPN Multi-Site Using CloudSec
* Displaying Statistics for Secure VXLAN EVPN Multi-Site Using CloudSec
* Configuration Examples for Secure VXLAN EVPN Multi-Site Using CloudSec
* Migrating from Multi-Site with VIP to Multi-Site with PIP
  * Migration of Existing vPC BGWs
  * vPC Border Gateways
  * Enhanced Convergence
  * CloudSec Configurations

### Chapter 24: Configuring VXLAN QoS
* Information About VXLAN QoS
* VXLAN QoS Terminology
* VXLAN QoS Features
  * Trust Boundaries
  * Classification
  * Marking
  * Policing
  * Queuing and Scheduling
  * Traffic Shaping
  * Network QoS
  * VXLAN Priority Tunneling
  * MQC CLI
* VXLAN QoS Topology and Roles
  * Ingress VTEP and Encapsulation in the VXLAN Tunnel
  * Transporting VXLAN Packets
  * Egress VTEP and Decapsulation of the VXLAN Tunnel
* Classification at the Ingress VTEP, Spine, and Egress VTEP
  * IP to VXLAN
  * Inside the VXLAN Tunnel
  * VXLAN to IP
  * Decapsulated Packet Priority Selection
* Guidelines and Limitations for VXLAN QoS
* Default Settings for VXLAN QoS
* Configuring VXLAN QoS
* Configuring Type QoS on the Egress VTEP
* Verify the VXLAN QoS Configuration
* VXLAN QoS Configuration Examples

### Chapter 25: Configuring vPC Fabric Peering
* vPC fabric peerings
* Supported platforms and limitations for vPC fabric peering
* Configure vPC fabric peering connections
* Migrate from vPC to vPC fabric peering
* Verifying vPC fabric peering configuration

### Chapter 26: Configuring Seamless Integration of EVPN with L3VPN (MPLS LDP)
* Information About Configuring Seamless Integration of EVPN with L3VPN (MPLS LDP)
* Guidelines and Limitations for Configuring Seamless Integration of EVPN with L3VPN (MPLS LDP)
* Configuring Seamless Integration of EVPN with L3VPN (MPLS LDP)

### Chapter 27: Configuring Seamless Integration of EVPN with L3VPN (MPLS SR)
* Information About Configuring Seamless Integration of EVPN with L3VPN (MPLS SR)
* Guidelines and Limitations for Configuring Seamless Integration of EVPN with L3VPN (MPLS SR)
* Configuring Seamless Integration of EVPN with L3VPN (MPLS SR)
* Example Configuration for Configuring Seamless Integration of EVPN with L3VPN (MPLS SR)
* Configure DSCP Based SR-TE Flow Steering

### Chapter 28: Configuring Seamless Integration of EVPN with L3VPN SRv6
* About Seamless Integration of EVPN with L3VPN SRv6 Handoff
* Guidelines and Limitations for EVPN to L3VPN SRv6 Handoff
* Import L3VPN SRv6 Routes into EVPN VXLAN
* Importing EVPN VXLAN Routes into L3VPN SRv6
* Example Configuration for VXLAN EVPN to L3VPN SRv6 Handoff

### Chapter 29: Configuring Seamless Integration of EVPN (TRM) with MVPN
* About Seamless Integration of EVPN (TRM) with MVPN (Draft Rosen)
* Supported RP Positions
* Guidelines and Limitations for Seamless Integration of EVPN (TRM) with MVPN
* Configuring the Handoff Node for Seamless Integration of EVPN (TRM) with MVPN
  * PIM/IGMP Configuration for the Handoff Node
  * BGP Configuration for the Handoff Node
  * VXLAN Configuration for the Handoff Node
  * MVPN Configuration for the Handoff Node
  * CoPP Configuration for the Handoff Node
* Configuration Example for Seamless Integration of EVPN (TRM) with MVPN

### Chapter 30: Configure VXLAN BGP-EVPN Null Route
* EVPN null routes
* Requirement: Configure and manage VXLAN BGP-EVPN null route MACs consistently
* Configure static MAC addresses
* Configure ARP/ND
* Configure a prefix-null route on a local VTEP
* Configure RPM route-map on remote VTEP
* Null route configuration options
* EVPN null route verification commands

### Appendix A: Configuring Bud Node
* VXLAN Bud Nodes
* VXLAN Bud Node Over vPC Topology Examples

### Appendix B: DHCP Relay in VXLAN BGP EVPN
* DHCP relay agents in VXLAN BGP EVPN fabrics
* Guidelines and limitations for DHCP relay in VXLAN BGP EVPN
* DHCP relay in VXLAN BGP EVPN supported release and platform
* DHCP Relay in VXLAN BGP EVPN Example
* DHCP Relay on VTEPs
  * Client on Tenant VRF and Server on Layer 3 Default VRF
  * Client on Tenant VRF (SVI X) and Server on the Same Tenant VRF (SVI Y)
  * Client on Tenant VRF (VRF X) and Server on Different Tenant VRF (VRF Y)
  * Client on Tenant VRF and Server on Non-Default Non-VXLAN VRF
* Configuring vPC Peers Example
* vPC VTEP DHCP Relay Configuration Example

### Appendix C: Configuring Layer 4 - Layer 7 Network Services Integration
* About VXLAN Layer 4 - Layer 7 Services
* Integrating Layer 3 Firewalls in VXLAN Fabrics
  * Single-Attached Firewall with Static Routing
  * Recursive Static Routes Distributed to the Rest of the Fabric
  * Redistribute Static Routes into BGP and Advertise to the Rest of the Fabric
  * Dual-Attached Firewall with Static Routing
  * Single-Attached Firewall with eBGP Routing
  * Dual-Attached Firewall with eBGP Routing
  * Per-VRF Peering via vPC Peer-Link
  * Dual-Attached Firewall with OSPF
  * Redistribute OSPF Routes into BGP and Advertise to the Rest of the Fabric
  * Firewall as Default Gateway
* Transparent Firewall Insertion
  * Overview of EVPN with Transparent Firewall Insertion
  * EVPN with Transparent Firewall Insertion Example
  * Show Command Examples
* Firewall Clustering with VXLAN BGP EVPN
* Service Redirection in VXLAN EVPN Fabrics
  * Use of Policy-Based Redirect for Services Insertion
  * Guidelines and Limitations for Policy-Based Redirect
  * Enable the Policy-Based Redirect Feature
  * Configuring a Route Policy
  * Verifying the Policy-Based Redirect Configuration
  * Configuration Example for Policy-Based Redirect
* Enhanced-Policy Based Redirect (ePBR)

### Appendix D: Configuring Proportional Multipath for VNF
* Proportional Multipaths for VNF
* Proportional Multipaths
* Prerequisites for Proportional Multipath for VNF
* Guidelines and Limitations for Proportional Multipath for VNF
* Configure the Spine or Route Reflector
* Configure the Leaf or ToR
* Configure the Border Leaf or Border Gateway
* Configure the BGP Legacy Peer
* Configure a User-Defined Profile for Maintenance Mode
* Configure a User-Defined Profile for Normal Mode
* Configure a Default Route Map
* Apply a Route Map to a Route Reflector
* Verify the Proportional Multipath for VNF
* Configuration Example for Proportional Multipath for VNF with Multi-Site

### Appendix E: Configuring ND Suppression
* ND suppression mechanisms
* Best practices for ND suppression
* Configure ND suppression
* ND suppression configuration outputs

---

## Preface

This preface includes the following sections:
* Audience
* Document Conventions
* Related Documentation for Cisco Nexus 9000 Series Switches
* Documentation Feedback
* Communications, services, and additional information

### Audience
This publication is for network administrators who install, configure, and maintain Cisco Nexus switches.

### Document Conventions
Command descriptions use the following conventions:

| Convention | Description |
|:---|:---|
| **bold** | Bold text indicates the commands and keywords that you enter literally as shown. |
| *italic* | Italic text indicates arguments for which you supply the values. |
| `[x]` | Square brackets enclose an optional element (keyword or argument). |
| `[x \| y]` | Square brackets enclosing keywords or arguments that are separated by a vertical bar indicate an optional choice. |
| `{x \| y}` | Braces enclosing keywords or arguments that are separated by a vertical bar indicate a required choice. |
| `[x {y \| z}]` | Nested set of square brackets or braces indicate optional or required choices within optional or required elements. Braces and a vertical bar within square brackets indicate a required choice within an optional element. |
| `variable` | Indicates a variable for which you supply values, in a context where italics cannot be used. |
| `string` | A nonquoted set of characters. Do not use quotation marks around the string or the string includes the quotation marks. |

Examples use the following conventions:

| Convention | Description |
|:---|:---|
| `screen font` | Terminal sessions and information the switch displays are in screen font. |
| **`boldface screen font`** | Information that you must enter is in boldface screen font. |
| *`italic screen font`* | Arguments for which you supply values are in italic screen font. |
| `< >` | Nonprinting characters, such as passwords, are in angle brackets. |
| `[ ]` | Default responses to system prompts are in square brackets. |
| `!` or `#` | An exclamation point (!) or a pound sign (#) at the beginning of a line of code indicates a comment line. |

### Related Documentation for Cisco Nexus 9000 Series Switches
The entire Cisco Nexus 9000 Series switch documentation set is available at the following URL:
[Cisco Nexus 9000 Series Switches Support Documentation](https://www.cisco.com/en/US/products/ps13386/tsd_products_support_series_home.html)

### Documentation Feedback
To provide technical feedback on this document, or to report an error or omission, please send your comments to [nexus9k-docfeedback@cisco.com](mailto:nexus9k-docfeedback@cisco.com). We appreciate your feedback.

### Communications, Services, and Additional Information
* To receive timely, relevant information from Cisco, sign up at [Cisco Profile Manager](https://profile.cisco.com/).
* To get the business impact you're looking for with the technologies that matter, visit [Cisco Services](https://www.cisco.com/c/en/us/services/index.html).
* To submit a service request, visit [Cisco Support](https://www.cisco.com/c/en/us/support/index.html).
* To discover and browse secure, validated enterprise-class apps, products, solutions, and services, visit [Cisco DevNet](https://developer.cisco.com/).
* To obtain general networking, training, and certification titles, visit [Cisco Press](https://www.ciscopress.com/).
* To find warranty information for a specific product or product family, access [Cisco Warranty Finder](https://www.cisco-warrantyfinder.com/).

### Cisco Bug Search Tool
Cisco Bug Search Tool (BST) is a gateway to the Cisco bug-tracking system, which maintains a comprehensive list of defects and vulnerabilities in Cisco products and software. The BST provides you with detailed defect information about your products and software.

### Documentation Feedback
To provide feedback about Cisco technical documentation, use the feedback form available in the right pane of every online document.

## New and Changed Information

| Feature | Description | Changed in Release | Where Documented |
| :--- | :--- | :--- | :--- |
| **VXLAN PIM BiDir underlay support** | Added support for PIM BiDir on Cisco Nexus 9300-FX3/GX/GX2/H2R/H1 switches, and 9500 switches with 9700-GX line cards. | 10.3(5)M | [Underlay Considerations](page_51)<br>[VXLAN EVPN Programmable Fabric Multicast Routing Support](page_68) |
| **Q-in-VNI with Layer 2 Protocol Tunneling** | Added Ethertype support for Q-in-VNI with L2PT on Cisco Nexus 9300-FX2/FX3/GX/GX2 ToR switches. | 10.3(3)F | [Guidelines and Limitations for Q-in-VNI with L2PT](page_346)<br>[Configure the Q-in-VNI with L2PT](page_346)<br>[Verify the Q-in-VNI with L2PT Configuration](page_347) |
| **PKI Support on CloudSec** | Added PKI Support on CloudSec. | 10.3(3)F | [Attach a Certificate to CloudSec](page_402)<br>[Configure the Separate Loopback](page_403) |
| **IPv6 underlay - VXLAN Access features** | VXLAN access features are supported with IPv6 underlay. | 10.3(3)F | [VXLANv6 deployment features and limitations](page_147) |
| **Expanded support for Type-6 password encryption** | Added Type-6 encryption support for LDP user password. | 10.3(3)F | [Guidelines and Limitations for Configuring Seamless Integration of EVPN with L3VPN (MPLS LDP)](page_450) |
| **TRM Data MDT** | Supports optimized TRM by using MVPN S-PMSI routes. | 10.3(2)F | [Configure TRM Data MDT](page_325) |
| **Enhanced Convergence for vPC BGW CloudSec Deployments** | Enhanced the support on Convergence for vPC BGW CloudSec Deployments. | 10.3(2)F | [Enhanced Convergence](page_416) |
| **vPC Fabric Peering** | The vPC Fabric Peering is supported for IPv6 underlay on Cisco Nexus 9300-EX/FX/FXP/FX2/FX3/GX/GX2 ToR switches. | 10.3(2)F | [Supported platforms and limitations for vPC fabric peering](page_438)<br>[Configure vPC fabric peering connections](page_440) |
| **Q-in-VNI with Layer 2 Protocol Tunneling** | Q-in-VNI with Layer 2 Protocol Tunneling is supported on Cisco Nexus 9300-FX/FX2/FX3/GX/GX2 ToR switches. | 10.3(2)F | [Q-in-VNIs](page_346) |
| **EVPN Null route** | Added support for VXLAN BGP-EVPN Null route. | 10.3(2)F | [Supported features and configuration limits for VXLAN BGP EVPN](page_83)<br>[Configure VXLAN BGP-EVPN Null Route](page_501) |
| **Multicast Flow Path Visibility for TRM Flows** | The Multicast Flow Path Visualization (FPV) for TRM Flows feature is supported for TRM L3 mode and underlay multicast along with the already supported multicast flows. | 10.3(2)F | [Multicast flow path visibility for TRM flows](page_292)<br>[Supported features and limitations of Layer 3 TRM](page_294) |
| **DSCP Based SR-TE Flow Steering** | Added support for DSCP based SR-TE flow steering on Cisco Nexus 9300-FX platform switches and Cisco Nexus 9700-FX and 9700-GX line cards. | 10.3(2)F | [Guidelines and Limitations for Configuring Seamless Integration of EVPN with L3VPN (MPLS SR)](page_459) |
| **Seamless integration of EVPN with L3VPN (MPLS SR)** | Added support for Seamless integration of EVPN with L3VPN (MPLS SR) on Cisco Nexus 9300-FX platform switches and Cisco Nexus 9700-FX and 9700-GX line cards. | 10.3(2)F | [Guidelines and Limitations for Configuring Seamless Integration of EVPN with L3VPN (MPLS SR)](page_459) |
| **DSCP Based SR-TE Flow Steering** | Allows source routing of VXLAN packets that are matched using the DSCP fields in the IP header and steered into an SRTE path. | 10.3(1)F | [Information About Configuring Seamless Integration of EVPN with L3VPN (MPLS SR)](page_455)<br>[Guidelines and Limitations for Configuring Seamless Integration of EVPN with L3VPN (MPLS SR)](page_459)<br>[Configure DSCP Based SR-TE Flow Steering](page_477) |
| **Flex stats for TRM - underlay and overlay mroutes** | The flex stats configuration is supported on Cisco Nexus 9300-X Cloud Scale switches. | 10.3(1)F | [Features and limitations of Tenant Routed Multicast](page_292)<br>[Flex stats](page_323)<br>[Configure Flex Stats for TRM](page_324) |
| **Extended dual stack host template** | Support for extended dual-stack-host-scale template is provided for ARP, ND, and MAC on the Cisco Nexus 9300-FX3/GX/GX2B ToR switches. | 10.3(1)F | [VXLAN deployment requirements and platform support](page_19) |
| **TRM support for new L3VNI mode** | TRM support for the new L3VNI mode CLIs are provided on Cisco Nexus 9300-X Cloud Scale switches. | 10.3(1)F | [Supported features and limitations of Layer 3 TRM](page_294)<br>[Configure Layer 3 Tenant Routed Multicast](page_311) |
| **VXLAN overlay with NBM underlay** | The NBM and VXLAN can co-exist on the same box but in two different VRFs. | 10.3(1)F | [Guidelines and Limitations for VXLAN](page_11) |
| **ND Suppression support** | ND suppression feature is supported to reduce the NS traffic across the overlay. | 10.3(1)F | [Configuring ND Suppression](page_599) |
| **vPC Fabric peering** | The IPv4 vPC Fabric peering config works only with the IPv4 VXLAN underlay and the IPv6 vPC Fabric peering config will work only with the IPv6 VXLAN underlay. | 10.3(1)F | [Supported platforms and limitations for vPC fabric peering](page_438)<br>[Migrate from vPC to vPC fabric peering](page_445) |

---

## Overview

This chapter contains the following sections:

* [Licensing Requirements](#licensing-requirements)
* [Supported Platforms](#supported-platforms)
* [VXLAN Overview](#vxlan-overview)
* [Cisco Nexus 9000 as Hardware-Based VXLAN Gateway](#cisco-nexus-9000-as-hardware-based-vxlan-gateway)
* [VXLAN Encapsulation and Packet Format](#vxlan-encapsulation-and-packet-format)
* [VXLAN Tunnel](#vxlan-tunnel)
* [VXLAN Tunnel Endpoint](#vxlan-tunnel-endpoint)
* [Underlay Network](#underlay-network)
* [Overlay Network](#overlay-network)
* [Distributed Anycast Gateway](#distributed-anycast-gateway)
* [Control Plane](#control-plane)

### Licensing Requirements
See the *Cisco NX-OS Licensing Guide* and *Cisco NX-OS Licensing Options Guide* for Cisco NX-OS licensing recommendations and instructions to obtain and apply licenses.

### Supported Platforms
See the *Nexus Switch Platform Support Matrix* to identify which Cisco NX-OS releases support specific features on various Cisco Nexus 9000 and 3000 switches.

### VXLAN Overview
Virtual Extensible LAN (VXLAN) provides a way to extend Layer 2 networks across a Layer 3 infrastructure using MAC-in-UDP encapsulation and tunneling. This feature enables virtualized and multitenant data center fabric designs over a shared, common physical infrastructure.

* **Layer 2 Extension**: VXLAN extends Layer 2 segments over the underlying shared Layer 3 network infrastructure so that tenant workloads can be placed across physical pods in a single data center or across several geographically diverse data centers.
* **16 Million Segments**: VXLAN uses a 24-bit segment ID, the VXLAN Network Identifier (VNID). This allows a maximum of 16 million VXLAN segments to coexist in the same administrative domain. In comparison, traditional VLANs use a 12-bit segment ID that supports a maximum of 4096 VLANs.
* **Underlay Routing**: VXLAN packets are transferred through the underlying network based on their Layer 3 headers. They use Equal-Cost Multipath (ECMP) routing and link aggregation protocols to utilize all available paths. In contrast, a traditional Layer 2 network might block valid forwarding paths to avoid loops.

### Cisco Nexus 9000 as Hardware-Based VXLAN Gateway
A Cisco Nexus 9000 Series switch can function as a hardware-based VXLAN gateway. It seamlessly connects VXLAN and VLAN segments as one forwarding domain across the Layer 3 boundary without sacrificing forwarding performance. The Cisco Nexus 9000 Series hardware-based VXLAN encapsulation and de-encapsulation provide line-rate performance for all frame sizes.

### VXLAN Encapsulation and Packet Format
VXLAN is a Layer 2 overlay scheme over a Layer 3 network. It uses MAC Address-in-User Datagram Protocol (MAC-in-UDP) encapsulation to extend Layer 2 segments across the data center network. The transport protocol over the physical data center network is IP plus UDP.

VXLAN defines a MAC-in-UDP encapsulation scheme where the original Layer 2 frame has a VXLAN header added and is then placed in a UDP-IP packet. With this encapsulation, VXLAN tunnels Layer 2 networks over Layer 3 networks.

An 8-byte VXLAN header consists of a 24-bit VNID and a few reserved bits. The VXLAN header, along with the original Ethernet frame, is placed inside the UDP payload. The 24-bit VNID is used to identify Layer 2 segments and maintain isolation between them.

*(Figure 1: VXLAN Packet Format)*

### VXLAN Tunnel
A VXLAN tunnel is the encapsulated communication path between two devices where they encapsulate and decapsulate an inner Ethernet frame. VXLAN tunnels are stateless because they are UDP encapsulated.

### VXLAN Tunnel Endpoint
VXLAN Tunnel Endpoints (VTEPs) are devices that terminate VXLAN tunnels. They perform VXLAN encapsulation and de-encapsulation.

Each VTEP has two types of interfaces:
* A Layer 2 interface on the local LAN segment to support local endpoint communication through bridging.
* A Layer 3 interface on the IP transport network.

The IP interface has a unique address that identifies the VTEP device in the transport network. The VTEP device uses this IP address to encapsulate Ethernet frames and transmit the packets on the transport network. A VTEP discovers other VTEP devices that share the same VNIs it has locally connected, advertises locally connected MAC addresses to its peers, and learns remote MAC-to-VTEP mappings through its IP interface.

### Underlay Network
The VXLAN segments are independent of the underlying physical network topology. Conversely, the underlying IP network (the underlay network) is independent of the VXLAN overlay. The underlay network forwards VXLAN-encapsulated packets based on the outer IP address header. The outer IP header uses the initiating VTEP's IP interface as the source IP address and the terminating VTEP's IP interface as the destination IP address.

The primary purpose of the underlay in the VXLAN fabric is to advertise the reachability of the VTEPs and provide fast, reliable transport for VXLAN traffic.

### Overlay Network
An overlay network is a virtual network built on top of an underlay network infrastructure. In a VXLAN fabric, the overlay network consists of a control plane and the VXLAN tunnels. 

* It is a virtual network built on an underlay infrastructure.
* The control plane advertises MAC address reachability.
* VXLAN tunnels transport Ethernet frames between VTEPs.

### Distributed Anycast Gateway
Distributed Anycast Gateway refers to the use of default gateway addressing that uses the same IP and MAC address across all Leafs that are part of a VNI. This ensures that every Leaf can function as the default gateway for the workloads directly connected to it. 

* The same IP and MAC address are used as the default gateway across all Leafs in a VNI.
* Each Leaf functions as the default gateway for directly connected workloads.
* This functionality facilitates flexible workload placement and optimal traffic forwarding across the VXLAN fabric.

### Control Plane
The control plane in VXLAN networks determines how endpoint reachability and forwarding information is distributed among VTEPs. Two widely adopted control planes are used with VXLAN:

* Flood-and-Learn Multicast-Based Learning Control Plane
* VXLAN MP-BGP EVPN Control Plane

#### Flood-and-Learn Multicast-Based Learning Control Plane
Cisco Nexus 9000 Series switches support the flood-and-learn multicast-based control plane method.

* **Multicast Groups**: When configuring VXLAN with a multicast-based control plane, every VTEP configured with a specific VXLAN VNI joins the same multicast group. Each VNI can have its own multicast group, or several VNIs can share the same group.
* **BUM Traffic**: The multicast group is used to forward Broadcast, Unknown Unicast, and Multicast (BUM) traffic for a VNI.
* **Multicast Requirements**: The multicast configuration must support Any-Source Multicast (ASM) or PIM BiDir.
* **Learning Mechanism**: Initially, VTEPs only learn the MAC addresses of devices that are directly connected to them. Remote MAC address-to-VTEP mappings are learned via conversational learning.

#### VXLAN MP-BGP EVPN Control Plane
A Cisco Nexus 9000 Series switch can be configured to provide a Multiprotocol Border Gateway Protocol (MP-BGP) Ethernet VPN (EVPN) control plane. This control plane uses a distributed Anycast Gateway with Layer 2 and Layer 3 VXLAN overlay networks.

* **Flexible Workload Placement**: Workload placement is not restricted by the physical topology of the data center network. Virtual machines can be placed anywhere in the data center fabric.
* **Optimal East-West Traffic**: East-West traffic between servers or virtual machines is achieved by the most specific routing at the first-hop router (access layer). Host routes are exchanged to ensure optimal routing to and from servers or hosts. Virtual machine (VM) mobility is supported by detecting new endpoint attachments when a new MAC/IP address is seen directly connected to the local switch. The local switch then signals this new location to the rest of the network.
* **Reduced Flooding**: Flooding is reduced by distributing MAC reachability information via MP-BGP EVPN to optimize L2 unknown unicast traffic. Optimization and reduction of broadcasts associated with ARP/IPv6 Neighbor Solicitation are achieved by distributing the necessary information via MP-BGP EVPN, which is then cached at the access switches. Address solicitation requests can be responded to locally without...

...sending a broadcast to the rest of the fabric.
* A standards-based control plane that can be deployed independent of a specific fabric controller.
* The MPBGP EVPN control plane approach provides:
    * IP reachability information for the tunnel endpoints associated with a segment and the hosts behind a specific tunnel endpoint.
    * Distribution of host MAC reachability to reduce/eliminate unknown unicast flooding.
    * Distribution of host IP/MAC bindings to provide local ARP suppression.
    * Host mobility.
    * A single address family (MPBGP EVPN) to distribute both L2 and L3 route reachability information.
* Segmentation of Layer 2 and Layer 3 traffic.
* Traffic segmentation is achieved using VXLAN encapsulation, where the VNI acts as the segment identifier.

---

## Configure VXLAN

This chapter contains the following sections:
* [Guidelines and Limitations for VXLAN](#guidelines-and-limitations-for-vxlan)
* [VXLAN Deployment Requirements and Platform Support](#vxlan-deployment-requirements-and-platform-support)
* [vPC Considerations for VXLAN Deployment](#vpc-considerations-for-vxlan-deployment)
* [VXLAN Network Requirements](#vxlan-network-requirements)
* [VXLAN Transport Network Configuration Requirements](#vxlan-transport-network-configuration-requirements)
* [Nested VXLAN Overlays](#nested-vxlan-overlays)
* [Configuring VXLAN](#configuring-vxlan)
* [VXLAN and IP-in-IP Tunnels](#vxlan-and-ip-in-ip-tunnels)
* [Configuring VXLAN Static Tunnels](#configuring-vxlan-static-tunnels)

---

### Guidelines and Limitations for VXLAN

#### Switch and Port Restrictions
The following switch and port restrictions apply to VXLAN:

* FEX ports do not support IGMP snooping on VXLAN VLANs.
* The VXLAN UDP port number is used for VXLAN encapsulation. For Cisco Nexus NX-OS, the UDP port number is 4789. It complies with IETF standards and is not configurable.
* Cisco Nexus 9300 Series switches with 100G uplinks only support VXLAN switching/bridging. Cisco Nexus 9200, 9300-EX, 9300-FX, and 9300-FX2 platform switches do not have this restriction.

> **Note:** For VXLAN routing support on Cisco Nexus 9300 Series switches with 100G uplinks, a 40G uplink module is required.

* When SVI is enabled on a VTEP (flood and learn, or EVPN), make sure that ARP-ETHER TCAM is carved using the `hardware access-list tcam region arp-ether 256` command. This requirement does not apply to Cisco Nexus 9200, 9300-EX, 9300-FX/FX2/FX3, and 9300-GX/GX2 platform switches, and Cisco 9500 Series switches with 9700-EX/FX/GX line cards.
* Beginning with Cisco NX-OS Release 10.2(3)F, VXLAN can coexist with the GRE tunnel feature or the MPLS (static or segment-routing) feature.
* Native VLANs are supported as transit traffic over a VXLAN fabric on Cisco Nexus 9300-EX/FX/FX2/FX3/GX/GX2 Series switches.
* A FEX HIF (FEX host interface port) is supported for a VLAN that is extended with VXLAN.
* Bind NVE to a loopback address that is separate from other loopback addresses required by Layer 3 protocols. A best practice is to use a dedicated loopback address for VXLAN. This practice should be applied to all VXLAN deployments, including vPC VXLAN.
* A Tenant VRF (VRF with a VNI mapped to it) cannot be used on an SVI that has no VNI binding (underlay infra VRF).
* For traceroute through a VXLAN fabric when using L3VNI, the following scenario is the expected behavior:
    * If an L3VNI is associated with a VRF and an SVI, and the associated SVI does not have an L3 IP address configured but instead has the `ip forward` command, it cannot respond back to the traceroute with its own SVI address. 
    * Instead, when a traceroute involving the L3VNI is run through the fabric, the IP address reported will be the lowest IP address of an SVI belonging to the corresponding tenant VRF.
* In an ingress replication vPC setup, Layer 3 connectivity is required between vPC peer devices.

#### VXLAN Configuration Restrictions
Review the following restrictions before configuring VXLAN:

* `show` commands with the `internal` keyword are not supported.
* The `lacp vpc-convergence` command can be configured in both VXLAN and non-VXLAN environments that have vPC port channels to hosts supporting LACP.
* For scale environments, the VLAN IDs related to the VRF and Layer-3 VNI (L3VNI) must be reserved using the `system vlan nve-overlay id` command.
* The `load-share` keyword is available in the Route Policy configuration procedure for the Policy-Based Routing (PBR) over VXLAN feature.
    * For information regarding the `load-share` keyword usage for PBR with VXLAN, see the *Guidelines and Limitations for Policy-Based Routing* section of the *Cisco Nexus 9000 Series NX-OS Unicast Routing Configuration Guide*.
* The `lacp vpc-convergence` command is designed for improved convergence of Layer 2 EVPN VXLAN:

```nx-os
interface port-channel10
  switchport
  switchport mode trunk
  switchport trunk allowed vlan 1001-1200
  spanning-tree port type edge trunk
  spanning-tree bpdufilter enable
  lacp vpc-convergence
  vpc 10

interface Ethernet1/34
  switchport
  switchport mode trunk
  switchport trunk allowed vlan 1001-1200
  channel-group 10 mode active
  no shutdown
```

* The `system nve ipmc` command is not applicable to Cisco Nexus 9200 and 9300-EX platform switches, and Cisco Nexus 9500 platform switches with 9700-EX line cards.
* The PIC Core (`system pic-core` command) and PIC Edge features are not compatible with a VXLAN environment and must be used exclusively in a native Layer 3 environment.
* The VXLAN network identifier (VNID) 16777215 is reserved and must not be configured explicitly.
* To refresh a frozen duplicate host during fabric forwarding, use only the `fabric forwarding dup-host-recovery-timer` command. Do not use the `fabric forwarding dup-host-unfreeze-timer` command, as it is deprecated.

#### ISSU Restrictions
Review the following ISSU restrictions for VXLAN:

* VXLAN supports In-Service Software Upgrades (ISSUs). However, VXLAN ISSU is not supported on Cisco Nexus 9300-GX platform switches.
* To remove configurations from an NVE interface, it is recommended to manually remove each configuration command rather than using the `default interface nve` command.
* Rollback is not supported on VXLAN VLANs configured with the port VLAN mapping feature.

#### Feature Support and Restrictions

##### ACL Options for VXLAN Traffic
*Supported ACL Options on Cisco Nexus 92300YC, 92160YC-X, 93120TX, 9332PQ, and 9348GC-FXP Switches:*

| Supported | Traffic Type | Flow Direction | Port Type | VTEP Type | ACL Type | ACL Direction |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **YES** | Native L2 traffic `[GROUP:inner]` | Access to Network `[GROUP:encap direction]` | L2 port | Ingress VTEP | PACL | Ingress |
| **YES** | Native L2 traffic `[GROUP:inner]` | Access to Network `[GROUP:encap direction]` | VLAN | Ingress VTEP | VACL | N/A |
| **YES** | Native L3 traffic `[GROUP:inner]` | Access to Network `[GROUP:encap direction]` | Tenant L3 SVI | Ingress VTEP | RACL | Ingress |
| **NO** | VXLAN encap `[GROUP:outer]` | Access to Network `[GROUP:encap direction]` | Uplink L3/L3-PO/SVI | Ingress VTEP | RACL | Egress |
| **NO** | VXLAN encap `[GROUP:outer]` | Network to Access `[GROUP:decap direction]` | Uplink L3/L3-PO/SVI | Egress VTEP | RACL | Ingress |
| **NO** | Native L2 traffic `[GROUP:inner]` | Network to Access `[GROUP:decap direction]` | L2 port | Egress VTEP | PACL | Egress |
| **NO** | Native L2 traffic `[GROUP:inner]` | Network to Access `[GROUP:decap direction]` | VLAN | Egress VTEP | VACL | N/A |
| **YES** | Post-decap L3 traffic `[GROUP:inner]` | Network to Access `[GROUP:decap direction]` | Tenant L3 SVI | Egress VTEP | RACL | Egress |

* ACL Options for VXLAN traffic are supported on Cisco Nexus 92160YC-X, 93108TC-EX, 93180LC-EX, and 93180YC-EX switches in Cisco NX-OS Release 7.0(3)I6(1).
* Support is added for MultiAuth Change of Authorization (CoA). For more details, see the *Cisco Nexus 9000 Series NX-OS Security Configuration Guide*.

##### Multicast
* Beginning with Cisco NX-OS Release 10.3(1)F, the Non-blocking Multicast (NBM) feature and VXLAN can co-exist on the same switch but must be in two different VRFs.

> **Note:** Ensure that NBM is not enabled on the default VRF where the underlay network runs.

* NLB in unicast, multicast, and IGMP multicast modes is not supported on Cisco Nexus 9000 switch VXLAN VTEPs. The workaround is to place the NLB cluster behind an intermediary device (which supports NLB in the respective mode) and inject the cluster IP address as an external prefix into the VXLAN fabric.
* On Cisco Nexus 9500 Series switches, if `feature nv overlay` is enabled, ensure that the NVE interface is configured and in the `UP` state. Otherwise, multicast traffic may be silently dropped in the Fabric Modules when forwarded out of subinterfaces.
* If multiple VTEPs use the same multicast group address for underlay multicast but have different VNIs, the VTEPs should share at least one VNI in common. This ensures that NVE peer discovery occurs and underlay multicast traffic is forwarded correctly.
    * *Example:* Leaf switches L1 and L4 configure VNI 10, and border spines or leaf switches L2 and L3 configure VNI 20, with both VNIs sharing the same multicast group address. When L1 sends traffic to L4, the traffic passes through L2 or L3. Because NVE peer L1 is not learned on L2 or L3, the traffic is dropped. Therefore, VTEPs sharing a multicast group address must have at least one VNI in common for peer learning to succeed. This applies to VXLAN bud-node topologies and border spine cases.

##### PIM BiDir
* PIM BiDir for VXLAN underlay is supported both with and without vPC.
* The following features are **not supported** when PIM BiDir for VXLAN underlay is configured:
    * Flood and Learn VXLAN
    * Tenant Routed Multicast (TRM)
    * VXLAN EVPN Multi-Site
    * VXLAN EVPN Multihoming
    * vPC-attached VTEPs
* For redundant RPs, use Phantom RP.
* For transitioning from PIM ASM to PIM BiDir or from PIM BiDir to PIM ASM in the underlay, the following procedure is recommended:

```nx-os
no ip pim rp-address 192.0.2.100 group-list 230.1.1.0/8
clear ip mroute *
clear ip mroute date-created *
clear ip pim route *
clear ip igmp groups *
clear ip igmp snooping groups * vlan all
```
*Wait for all tables to completely clear.*
```nx-os
ip pim rp-address 192.0.2.100 group-list 230.1.1.0/8 bidir
```

* When entering the `no feature pim` command, NVE ownership on the route is not removed, so the route remains and traffic continues to flow. Route aging is handled by PIM. PIM does not age out entries that have a VXLAN encapsulation flag.

##### ARP Suppression
* Beginning with Cisco NX-OS Release 9.3(3), ARP suppression is supported for Cisco Nexus 9300-GX platform switches.
* Beginning with Cisco NX-OS Release 9.3(5), ARP suppression is supported with reflective relay for Cisco Nexus 9364C, 9300-EX, 9300-FX/FX2/FXP, and 9300-GX platform switches. For more details, see the *Cisco Nexus 9000 Series NX-OS Layer 2 Switching Configuration Guide*.
* ARP suppression is supported for a VNI only if the VTEP hosts the First-Hop Gateway (Distributed Anycast Gateway) for that VNI. The VTEP and SVI for this VLAN must be properly configured for Distributed Anycast Gateway operation (e.g., global anycast gateway MAC address and SVI anycast gateway virtual IP address configured).
* ARP suppression is a per-L2VNI fabric-wide setting. It must be enabled or disabled consistently across all VTEPs in the fabric. Inconsistent configuration is not supported.

##### FCoE/NPV
* Fibre Channel over Ethernet (FCoE) N-port Virtualization (NPV) can coexist with VXLAN on different fabric uplinks using the same or different front-panel ports on Cisco Nexus 93180YC-EX and 93180YC-FX switches.
* Fibre Channel N-port Virtualization (NPV) can coexist with VXLAN on different fabric uplinks using the same or different front-panel ports on Cisco Nexus 93180YC-FX switches. Note that VXLAN can exist only on Ethernet front-panel ports and not on FC front-panel ports.

##### Subinterfaces
* Beginning with Cisco NX-OS Release 9.3(5), subinterfaces on VXLAN uplinks can carry non-VXLAN L3 IP traffic on Cisco Nexus 9332C, 9364C, 9300-EX, 9300-FX/FX2/FXP, and 9300-GX platform switches, and Cisco Nexus 9500 platform switches with -EX/FX line cards. This is supported for VXLAN flood and learn, VXLAN EVPN, VXLAN EVPN Multi-Site, and DCI.
* Beginning with Cisco NX-OS Release 10.1(1), VXLAN-encapsulated traffic over a Parent Interface that Carries Subinterfaces is supported on Cisco Nexus 9300-FX3 platform switches.
* Beginning with Cisco NX-OS Release 9.3(5), VTEPs support VXLAN-encapsulated traffic over parent interfaces if subinterfaces are configured. This is supported for VXLAN flood and learn, VXLAN EVPN, VXLAN EVPN Multi-Site, and DCI. 

In the following example, VXLAN traffic is forwarded on the parent interface (`eth1/1`) in the default VRF, and L3 IP (non-VXLAN) traffic is forwarded on the subinterface (`eth1/1.10`) in the tenant VRF:

```nx-os
interface ethernet 1/1
  description VXLAN carrying interface
  no switchport
  ip address 10.1.1.1/30

interface ethernet 1/1.10
  description NO VXLAN
  no switchport
  vrf member Tenant10
  encapsulation dot1q 10
  ip address 10.10.1.1/30
```

#### Restrictions for Cisco Nexus 9504 and 9508 Switches with -R/-R2 Line Cards
Review the following restrictions for Cisco Nexus 9504 and 9508 switches equipped with -R line cards:

* For Cisco Nexus 9504 and 9508 switches with -R line cards, VXLAN Layer 2 Gateway is supported on the 9636C-RX line card. VXLAN and MPLS cannot be enabled on the Cisco Nexus 9508 switch simultaneously.
* If VXLAN is enabled on Cisco Nexus 9504 and 9508 switches with -R line cards, the Layer 2 Gateway cannot be enabled if there is any line card present other than the 9636C-RX.
* For Cisco Nexus 9504 and 9508 switches with -R line cards, PIM/ASM is supported on underlay ports. PIM/Bidir is not supported. For more details, see the *Cisco Nexus 9000 Series NX-OS Multicast Routing Configuration Guide*.
* IPv6 host routing in the overlay is supported.
* ARP suppression is supported.

