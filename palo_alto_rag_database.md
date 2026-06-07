# Palo Alto Networks PAN-OS Firewall Local RAG Database & Reference Guide

This document serves as a search-optimized reference database for Palo Alto Networks Next-Generation Firewalls (NGFW) running PAN-OS. It outlines CLI syntax, security rules, NAT policies, address/service objects, API credentials, and diagnostic routines.

---

## 📖 SECTION 1: PAN-OS Core Glossary and Security Architecture

| Term | Definition | PAN-OS CLI / API Scope |
| :--- | :--- | :--- |
| **Address Object** | A named IP address, subnet, range, or FQDN that can be referenced in multiple security rules. | `set address <name> ip-netmask <ip/mask>` |
| **Service Object** | A named protocol (TCP/UDP) and destination port mapping used to define allowed application flows. | `set service <name> protocol tcp port <number>` |
| **Security Zone** | A logical grouping of interfaces (e.g., Trust, Untrust, DMZ) that defines network boundaries. | `set zone <zone-name> network layer3 <interface>` |
| **Security Rule** | Access control policies defining source/destination zones, source/destination IPs, users, services, and actions (allow/deny). | `set rulebase security rules <rule-name>` |
| **Commit** | The process of compiling candidate configurations and pushing them to the active running configuration. | `commit` |
| **Panorama** | Centralized management platform used to distribute configuration templates and device groups across firewalls. | `set deviceconfig system panorama-server ...` |

---

## 🏛️ SECTION 2: PAN-OS CLI Configuration Templates

### 1. Address Objects & Groups
Address objects are fundamental blocks for security policies.
```text
set address Web_Server_Net ip-netmask 10.10.10.0/24
set address DB_Host_IP ip-netmask 10.10.20.50/32
set address Sales_IP_Range ip-range 10.20.10.10-10.20.10.50
set address Google_DNS fqdn google-public-dns-a.google.com

! Address Group definition
set address-group Trust_Subnets static [ Web_Server_Net DB_Host_IP ]
```

### 2. Service Objects & Groups
Service objects define target port mappings.
```text
set service TCP_8080 protocol tcp port 8080
set service UDP_Syslog protocol udp port 514
set service Multiport_TCP protocol tcp port 8000,8080,9000

! Service Group definition
set service-group Web_Services members [ TCP_8080 service-http service-https ]
```

### 3. Security Access Rules
Policies are processed from top to bottom. The first matching rule applies.
```text
set rulebase security rules Allow_Internal_Web from Trust to Untrust source any destination any service Web_Services action allow
set rulebase security rules Block_DB_External from Untrust to Trust source any destination DB_Host_IP service any action deny
set rulebase security rules Allow_Log_Forwarding from Trust to DMZ source Web_Server_Net destination any service UDP_Syslog action allow
```

---

## 🤖 SECTION 3: Ansible pan-os Playbook Templates

Ansible uses the `paloaltonetworks.panos` collection to communicate with the firewall via the XML API.

### 1. Provisioning Address Objects
```yaml
- name: Add Address Object
  paloaltonetworks.panos.panos_address_object:
    provider:
      ip_address: "{{ fw_ip }}"
      username: "{{ fw_username }}"
      password: "{{ fw_password }}"
    name: "Web_Server_Net"
    value: "10.10.10.0/24"
    address_type: "ip-netmask"
    state: present
```

### 2. Provisioning Security Rules
```yaml
- name: Add Security Access Rule
  paloaltonetworks.panos.panos_security_rule:
    provider:
      ip_address: "{{ fw_ip }}"
      username: "{{ fw_username }}"
      password: "{{ fw_password }}"
    rule_name: "Allow_External_Web"
    source_zone: ["Untrust"]
    destination_zone: ["Trust"]
    source_ip: ["any"]
    destination_ip: ["Web_Server_Net"]
    service: ["service-http", "service-https"]
    action: "allow"
    state: present
```

---

## 🔍 SECTION 4: PAN-OS Troubleshooting & Verification Commands

| CLI Verification Command | Target Objective | Expected Output / Checks |
| :--- | :--- | :--- |
| `show jobs processed` | Verify status of commit and API job runs. | Look for commit status showing `FIN` (Finished) and result `OK`. |
| `test security-policy-match` | Dry-run packets to see which security rule matches. | Output details the rule name matching, zone egress, and action. |
| `show running security-policy` | List active policies inside security engine memory. | Displays zones, subnet matchers, services, and actions. |
| `show interface all` | Check link status and IP bindings on hardware ports. | Enet ports should show state `up`, mode `layer3` or `layer2`. |
| `tail follow yes mp-log devsrv.log` | Follow live system management and API daemon logs. | Verify API call returns successfully without unauthorized error codes. |
