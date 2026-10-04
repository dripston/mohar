"use client";

import { useCallback, useEffect, useState } from "react";
import { isAddress, type Address } from "viem";
import { PauseCircle, PlayCircle, ShieldAlert } from "lucide-react";
import { certificateRegistryAbi, issuerRegistryAbi } from "@mohar/core";
import { Badge, Button, Card, Input, Label, Mono } from "@/components/ui/primitives";
import { deployment, DEV_WALLET_ENABLED } from "@/lib/config";
import { publicClient, useWallet } from "@/lib/wallet";
import { formatDate, shortHex } from "@/lib/utils";

interface IssuerRow {
  address: Address;
  name: string;
  domain: string;
  domainCheckedAt: number;
  revokedFrom: number;
  reason: number;
}

const REASONS = ["", "Key compromise", "Issued in error", "Misconduct", "Superseded", "Other"];

function friendly(e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  const known: Record<string, string> = {
    NotRoot: "Only the accreditation authority can do this.",
    AlreadyRegistered: "That address is already registered.",
    UnknownKey: "That key is not registered.",
    UnknownIssuer: "That issuer is not registered.",
    KeyAlreadyUsed: "That new key is already in use.",
    CannotLoosenRevocation: "A revocation can only be moved earlier, never later.",
    BadReason: "Pick a reason.",
    EmptyField: "Fill in every field.",
    "User rejected": "You rejected the request in your wallet.",
  };
  for (const [k, v] of Object.entries(known)) if (m.includes(k)) return v;
  return m.split("\n")[0]!.slice(0, 200);
}

export default function AdminPage() {
  const { writer, address, connect, kind, error } = useWallet();
  const [isRoot, setIsRoot] = useState<boolean>();
  const [paused, setPaused] = useState(false);
  const [issuers, setIssuers] = useState<IssuerRow[]>();
  const [busy, setBusy] = useState<string>();
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string }>();

  const [reg, setReg] = useState({ address: "", domain: "", name: "", checked: true });
  const [rev, setRev] = useState({ key: "", when: "", reason: "1" });
  const [rot, setRot] = useState({ oldKey: "", newKey: "" });

  const refresh = useCallback(async () => {
    const logs = await publicClient.getContractEvents({
      address: deployment.issuerRegistry,
      abi: issuerRegistryAbi,
      eventName: "IssuerRegistered",
      fromBlock: BigInt(deployment.deployBlock ?? 0),
    });
    const rows = await Promise.all(
      logs.map(async (l) => {
        const a = l.args.issuer as Address;
        const [i, k] = await Promise.all([
          publicClient.readContract({ address: deployment.issuerRegistry, abi: issuerRegistryAbi, functionName: "getIssuer", args: [a] }),
          publicClient.readContract({ address: deployment.issuerRegistry, abi: issuerRegistryAbi, functionName: "getKey", args: [a] }),
        ]);
        return { address: a, name: i.name, domain: i.domain, domainCheckedAt: Number(i.domainCheckedAt), revokedFrom: Number(k.revokedFrom), reason: Number(k.reason) };
      }),
    );
    setIssuers(rows);
    setPaused(
      (await publicClient.readContract({ address: deployment.certificateRegistry, abi: certificateRegistryAbi, functionName: "paused" })) as boolean,
    );
  }, []);

  useEffect(() => {
    refresh().catch(() => setIssuers([]));
  }, [refresh]);

  useEffect(() => {
    if (!address) return setIsRoot(undefined);
    publicClient
      .readContract({ address: deployment.issuerRegistry, abi: issuerRegistryAbi, functionName: "isRoot", args: [address] })
      .then((r) => setIsRoot(Boolean(r)))
      .catch(() => setIsRoot(false));
  }, [address]);

  async function run(label: string, fn: () => Promise<`0x${string}`>) {
    setBusy(label);
    setMsg(undefined);
    try {
      const hash = await fn();
      await publicClient.waitForTransactionReceipt({ hash });
      setMsg({ tone: "ok", text: `${label}: confirmed on chain.` });
      await refresh();
    } catch (e) {
      setMsg({ tone: "bad", text: friendly(e) });
    } finally {
      setBusy(undefined);
    }
  }

  const w = writer?.wallet;
  const call = (functionName: string, args: unknown[]) =>
    w!.writeContract({ address: deployment.issuerRegistry, abi: issuerRegistryAbi, functionName: functionName as any, args: args as any, chain: w!.chain });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <Badge tone="seal">
          <ShieldAlert size={12} /> Accreditation authority
        </Badge>
        <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Issuer registry</h1>
        <p className="mt-2 max-w-2xl text-muted">
          The root authority decides who may issue. Revoking a key takes effect from a chosen moment: certificates issued before it stay valid, certificates after it do not. That is how a stolen key is handled without erasing an honest institution's history.
        </p>
      </header>

      {!address ? (
        <Card className="p-6">
          <p className="mb-4 text-sm text-muted">Connect the accreditation authority wallet.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => connect("injected")} data-testid="connect-injected">
              Connect browser wallet
            </Button>
            {DEV_WALLET_ENABLED && (
              <Button variant="secondary" onClick={() => connect("dev-root")} data-testid="connect-dev-root">
                Use demo authority wallet (local network)
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-bad">
              {error}
            </p>
          )}
        </Card>
      ) : isRoot === false ? (
        <Card className="p-6" role="alert">
          <p className="font-medium">This wallet is not the accreditation authority.</p>
          <p className="mt-1 text-sm text-muted">
            Connected as <Mono>{address}</Mono> ({kind}). Only a root-authority wallet can register issuers or revoke keys. You can still read the registry below.
          </p>
        </Card>
      ) : (
        <Badge tone="ok" className="w-fit" >
          <span data-testid="admin-role">Root authority: {shortHex(address)}</span>
        </Badge>
      )}

      {msg && (
        <p role="status" data-testid="admin-msg" className={`rounded-xl px-4 py-3 text-sm ${msg.tone === "ok" ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad"}`}>
          {msg.text}
        </p>
      )}

      <div className={isRoot ? "grid gap-6 md:grid-cols-2" : "pointer-events-none grid gap-6 opacity-50 md:grid-cols-2"} aria-disabled={!isRoot}>
        <Card className="p-6 md:col-span-2">
          <h2 className="font-serif text-xl font-semibold">Accredit an issuer</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="ra">Signing key address</Label>
              <Input id="ra" data-testid="admin-register-address" placeholder="0x…" value={reg.address} onChange={(e) => setReg({ ...reg, address: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rd">Domain</Label>
              <Input id="rd" data-testid="admin-register-domain" placeholder="university.edu" value={reg.domain} onChange={(e) => setReg({ ...reg, domain: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rn">Institution name</Label>
              <Input id="rn" data-testid="admin-register-name" placeholder="Acharya Institute" value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} />
            </div>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reg.checked} onChange={(e) => setReg({ ...reg, checked: e.target.checked })} className="accent-[rgb(var(--seal))]" />
            I have confirmed the DNS TXT record <Mono>mohar-issuer=&lt;address&gt;</Mono> on this domain
          </label>
          <Button
            className="mt-4"
            data-testid="admin-register-submit"
            disabled={!!busy || !isAddress(reg.address) || !reg.domain || !reg.name}
            onClick={() => run("Issuer registered", () => call("registerIssuer", [reg.address, reg.domain.trim(), reg.name.trim(), reg.checked]))}
          >
            {busy === "Issuer registered" ? "Waiting for confirmation…" : "Register issuer"}
          </Button>
        </Card>

        <Card className="p-6">
          <h2 className="font-serif text-xl font-semibold">Revoke a key</h2>
          <p className="mt-1 text-sm text-muted">Effective from the time you choose. It may be in the past, and can only ever be moved earlier.</p>
          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="rk">Key address</Label>
              <Input id="rk" data-testid="admin-revoke-key" placeholder="0x…" value={rev.key} onChange={(e) => setRev({ ...rev, key: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rw">Effective from</Label>
              <Input id="rw" type="datetime-local" data-testid="admin-revoke-when" value={rev.when} onChange={(e) => setRev({ ...rev, when: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rr">Reason</Label>
              <select id="rr" data-testid="admin-revoke-reason" value={rev.reason} onChange={(e) => setRev({ ...rev, reason: e.target.value })} className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm">
                {REASONS.slice(1).map((r, i) => (
                  <option key={r} value={i + 1}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="danger"
              data-testid="admin-revoke-submit"
              disabled={!!busy || !isAddress(rev.key) || !rev.when}
              onClick={() => run("Key revoked", () => call("revokeIssuer", [rev.key, BigInt(Math.floor(new Date(rev.when).getTime() / 1000)), Number(rev.reason)]))}
            >
              Revoke key
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-serif text-xl font-semibold">Rotate a key</h2>
          <p className="mt-1 text-sm text-muted">The old key is revoked from now. Its past certificates stay valid, and the new key takes over managing them. Only the authority can rotate, so a thief holding the old key cannot.</p>
          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="ok">Old key</Label>
              <Input id="ok" data-testid="admin-rotate-old" placeholder="0x…" value={rot.oldKey} onChange={(e) => setRot({ ...rot, oldKey: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="nk">New key</Label>
              <Input id="nk" data-testid="admin-rotate-new" placeholder="0x…" value={rot.newKey} onChange={(e) => setRot({ ...rot, newKey: e.target.value })} />
            </div>
            <Button
              variant="secondary"
              data-testid="admin-rotate-submit"
              disabled={!!busy || !isAddress(rot.oldKey) || !isAddress(rot.newKey)}
              onClick={() => run("Key rotated", () => call("rotateIssuerKey", [rot.oldKey, rot.newKey]))}
            >
              Rotate key
            </Button>
          </div>
        </Card>

        <Card className="p-6 md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl font-semibold">Emergency stop</h2>
              <p className="mt-1 max-w-xl text-sm text-muted">
                Pausing stops new issuance only. Revocation, suspension and all verification keep working, so honest issuers can still withdraw bad certificates during an incident.
              </p>
            </div>
            <Badge tone={paused ? "bad" : "ok"}>
              <span data-testid="pause-state">{paused ? "Issuance paused" : "Issuance open"}</span>
            </Badge>
          </div>
          <Button
            className="mt-4"
            variant={paused ? "primary" : "secondary"}
            data-testid="admin-pause-toggle"
            disabled={!!busy}
            onClick={() =>
              run(paused ? "Issuance resumed" : "Issuance paused", () =>
                w!.writeContract({ address: deployment.certificateRegistry, abi: certificateRegistryAbi, functionName: paused ? "unpause" : "pause", chain: w!.chain }),
              )
            }
          >
            {paused ? <PlayCircle size={16} /> : <PauseCircle size={16} />} {paused ? "Resume issuance" : "Pause issuance"}
          </Button>
        </Card>
      </div>

      <section aria-labelledby="reg-h">
        <h2 id="reg-h" className="mb-3 font-serif text-xl font-semibold">
          Registered issuers
        </h2>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm" data-testid="issuer-table">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Institution</th>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Domain confirmed</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {issuers === undefined && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-muted">
                    Loading registry from chain…
                  </td>
                </tr>
              )}
              {issuers?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-muted">
                    No issuers registered yet.
                  </td>
                </tr>
              )}
              {issuers?.map((i) => (
                <tr key={i.address} data-testid={`issuer-${i.address.toLowerCase()}`}>
                  <td className="px-4 py-3 font-medium">{i.name}</td>
                  <td className="px-4 py-3">{i.domain}</td>
                  <td className="px-4 py-3">
                    <Mono>{shortHex(i.address)}</Mono>
                  </td>
                  <td className="px-4 py-3 text-muted">{i.domainCheckedAt ? formatDate(i.domainCheckedAt) : "Not yet"}</td>
                  <td className="px-4 py-3">
                    {i.revokedFrom ? (
                      <Badge tone="bad">
                        Revoked from {formatDate(i.revokedFrom)}: {REASONS[i.reason]}
                      </Badge>
                    ) : (
                      <Badge tone="ok">Active</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
