# deno-bunny-ddns

A small Bunny Edge Scripting service that lets a MikroTik router keep its own
DNS record up to date on [Bunny DNS](https://bunny.net/dns/), IPv4 and IPv6
both.

## How it works

RouterOS's only built-in dynamic DNS client (`/tool dns-update`) speaks raw
RFC 2136 DNS UPDATE and only works against a BIND server -- it can't talk to
Bunny, it can't run over HTTPS, and it's IPv4-only. Bunny Edge Scripting, in
turn, only serves HTTP(S); it can't stand in as a raw DNS server on port 53
either.

So instead this service exposes an HTTP `/update` endpoint in the same shape
that most routers (MikroTik included) already use for "custom" DDNS
providers: a `GET` request with basic auth, à la the classic dyndns2
protocol. A RouterOS scheduler script calls it every few minutes; the
service resolves the target Bunny DNS zone and creates or updates the A
and/or AAAA record for the given hostname.

```
Router --(scheduled /tool fetch)--> /update (this service) --(DNS Zone API)--> Bunny DNS
```

## Setup

### 1. Deploy the script

You'll need a [Deno](https://docs.deno.com/runtime/manual/getting_started/installation/)
installation for local checks:

```
# A tiny lint just to be sure!
deno task lint

# We ensure everything is type compliant!
deno task check

# Run the test suite
deno task test
```

Pushes to `main` are deployed straight to the configured Bunny script (see
[on-merge.yml](./.github/workflows/on-merge.yml)).

### 2. Configure the environment

Set these on the script under **Edge Platform > Scripting > your script >
Env Configuration** (or via `bunny scripts env set`). Store the last three as
secrets.

| Name                | Secret? | Description                                                      |
| ------------------- | ------- | ------------------------------------------------------------------ |
| `BUNNY_DNS_ZONE_ID`  | no      | The numeric id of the DNS zone to update (from its dashboard URL). |
| `BUNNY_API_KEY`      | yes     | A Bunny API key with access to that DNS zone.                     |
| `DDNS_USERNAME`      | yes     | Username the router must send.                                    |
| `DDNS_PASSWORD`      | yes     | Password the router must send. Make it long and random.           |

### 3. Point your router at it

Copy [`mikrotik/ddns-update.rsc`](./mikrotik/ddns-update.rsc) into a new
RouterOS script (System > Scripts), fill in the four variables at the top
(your script's URL, the hostname to update, the credentials from step 2, and
your WAN interface name), then add a scheduler entry to run it every few
minutes -- the exact command is at the bottom of that file.

## The `/update` endpoint

```
GET /update?hostname=<fqdn>[&myip=<ipv4>][&myipv6=<ipv6>]
Authorization: Basic <base64(username:password)>
```

- `hostname` -- required. Must be the zone's domain itself or a subdomain of it.
- `myip` -- optional. When omitted, the caller's observed IPv4 address is used instead, which is the more reliable option behind NAT/CGNAT.
- `myipv6` -- optional. There's no NAT to hide behind for IPv6, so send the router's actual global address explicitly if you want the AAAA record kept in sync.
- At least one of a resolved `myip` or `myipv6` is required.

The response body follows the familiar dyndns2 vocabulary (`good <ip>`,
`nochg <ip>`, `badauth`, `notfqdn`, `nohost`, `911`) with a matching HTTP
status code, one line per address family that was part of the request.

## Changeset

This template uses [changeset](https://github.com/changesets/changesets) for
version management. Changeset helps track and document changes in your project,
making it easier to manage releases and generate changelogs.

When you make changes to the project, you should create a changeset to describe
those changes:

1. Run the following command:
   ```
   pnpm changeset
   ```
2. Follow the prompts to select the type of change (major, minor, or patch) and provide a brief description.
3. Commit the generated changeset file along with your code changes.

This process ensures that all modifications are properly documented and
versioned, facilitating smoother releases and better communication about
project updates.

When you merge a pull request that includes a changeset, it will automatically
create an associated pull request to release your changes.

This new pull request will trigger the release process of the script to your
PullZone in Bunny.

> This behavior is disabled by default, every pushes on main are now pushed to
> Bunny directly.
> You can enable this pattern again by updating this
> [action](./.github/workflows/on-merge.yml)
