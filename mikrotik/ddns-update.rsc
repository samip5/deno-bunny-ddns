# Bunny DDNS updater for MikroTik RouterOS (v7+)
#
# Install:
#   1. Edit the four variables below.
#   2. In WinBox/WebFig open System > Scripts > Add New, paste this whole
#      file as the script "Source", and name it "bunny-ddns-update".
#   3. Add a scheduler entry so it runs periodically (see the command at
#      the bottom of this file, run once from a terminal).
#
# The router does not need to know its own public IPv4 address: the
# service reads it from the connecting request, which also works
# correctly behind CGNAT. IPv6 has no NAT to hide behind, so this script
# reads the router's own global address from $wanInterface and sends it
# explicitly.

:local ddnsUrl "https://your-script.b-cdn.net/update"
:local ddnsHost "home.example.com"
:local ddnsUser "router"
:local ddnsPass "change-me"
:local wanInterface "ether1"

:local ipv6Addr ""
:foreach i in=[/ipv6/address find where interface=$wanInterface !link-local disabled=no] do={
  :local candidate [/ipv6/address get $i address]
  :set ipv6Addr [:pick $candidate 0 [:find $candidate "/"]]
}

:local url ($ddnsUrl . "?hostname=" . $ddnsHost)
:if ([:len $ipv6Addr] > 0) do={
  :set url ($url . "&myipv6=" . $ipv6Addr)
}

:do {
  /tool fetch url=$url user=$ddnsUser password=$ddnsPass \
    check-certificate=yes output=none
  :log info "bunny-ddns: update sent for $ddnsHost"
} on-error={
  :log warning "bunny-ddns: update failed for $ddnsHost"
}

# One-time setup, run from the terminal after adding the script above:
# /system scheduler add name=bunny-ddns-update interval=5m \
#   on-event="/system script run bunny-ddns-update"
