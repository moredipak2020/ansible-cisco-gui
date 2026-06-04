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
