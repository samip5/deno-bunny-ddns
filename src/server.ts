import type { DnsClient } from "./bunny-dns.ts";
import { type DdnsConfig, handleUpdate } from "./ddns.ts";
import {
  clientIp,
  isIPv4,
  isIPv6,
  parseBasicAuth,
  timingSafeEqual,
} from "./http-utils.ts";

export async function handleRequest(
  req: Request,
  config: DdnsConfig,
  client: DnsClient,
): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/" || url.pathname === "/health") {
    return new Response("OK\n", { status: 200 });
  }
  if (url.pathname !== "/update") {
    return new Response("Not Found\n", { status: 404 });
  }

  const auth = parseBasicAuth(req);
  const authOk = auth
    ? await timingSafeEqual(
      `${auth.username}:${auth.password}`,
      `${config.username}:${config.password}`,
    )
    : false;
  if (!authOk) {
    return new Response("badauth\n", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="ddns"' },
    });
  }

  const hostname = url.searchParams.get("hostname");
  const observedIp = clientIp(req);

  const requestedIpv4 = url.searchParams.get("myip");
  if (requestedIpv4 && !isIPv4(requestedIpv4)) {
    return new Response("badagent\n", { status: 400 });
  }
  const ipv4 = requestedIpv4 ??
    (observedIp && isIPv4(observedIp) ? observedIp : null);

  const requestedIpv6 = url.searchParams.get("myipv6");
  if (requestedIpv6 && !isIPv6(requestedIpv6)) {
    return new Response("badagent\n", { status: 400 });
  }
  const ipv6 = requestedIpv6 ??
    (observedIp && isIPv6(observedIp) ? observedIp : null);

  const result = await handleUpdate({ hostname, ipv4, ipv6 }, config, client);
  return new Response(result.body, { status: result.status });
}
