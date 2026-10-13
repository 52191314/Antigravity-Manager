import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Chip, LedgerRow, PageHeader, SectionRule } from '../components/common/ledger';
import Mascot from '../components/common/Mascot';
import { useConfigStore } from '../stores/useConfigStore';
import { isTauri } from '../utils/env';
import { request as invoke } from '../utils/request';

/** Fallback when the config has not loaded yet (src-tauri/src/proxy/config.rs: ProxyConfig::default). */
const DEFAULT_PORT = 8045;

interface ProxyStatus {
    running: boolean;
    port: number;
    base_url: string;
    active_accounts: number;
}

const SECTIONS = [
    { id: 'what', label: 'What is Proxymateur' },
    { id: 'quick-start', label: 'Quick start' },
    { id: 'working', label: 'How to tell the proxy is working' },
    { id: 'pages', label: 'The pages' },
    { id: 'quotas', label: 'Accounts and quotas' },
    { id: 'demon', label: 'DEMON mode and Gemini routing' },
    { id: 'files', label: 'Where things live' },
    { id: 'troubleshooting', label: 'Troubleshooting' },
    { id: 'shortcuts', label: 'Keyboard shortcuts' },
] as const;

/** Inline code styling for paths, commands and values. */
function Code({ children }: { children: ReactNode }) {
    return <code className="font-mono text-[13px] bg-base-content/[0.06] rounded px-1.5 py-0.5">{children}</code>;
}

function P({ children }: { children: ReactNode }) {
    return <p className="text-sm leading-7 text-base-content/80">{children}</p>;
}

function InlineLink({ to, children }: { to: string; children: ReactNode }) {
    return (
        <Link to={to} className="text-base-content underline underline-offset-4 decoration-base-content/30 hover:decoration-base-content">
            {children}
        </Link>
    );
}

/** A section anchor target wrapping a SectionRule and its body. */
function Section({ id, index, label, children }: { id: string; index: string; label: string; children: ReactNode }) {
    return (
        <section id={id} className="scroll-mt-4">
            <SectionRule index={index} label={label} />
            <div className="space-y-3">{children}</div>
        </section>
    );
}

/** Ledger row with a fixed-width label column and wrapping description. */
function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
    return (
        <LedgerRow className="items-start">
            <div className="w-40 shrink-0 text-sm font-medium text-base-content">{label}</div>
            <div className="flex-1 min-w-0 text-sm leading-6 text-base-content/70">{children}</div>
        </LedgerRow>
    );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
    return (
        <LedgerRow className="items-start">
            <span className="w-6 shrink-0 text-sm tabular-nums text-base-content/35">{n}</span>
            <div className="flex-1 min-w-0 text-sm leading-6 text-base-content/80">{children}</div>
        </LedgerRow>
    );
}

function Kbd({ children }: { children: ReactNode }) {
    return (
        <kbd className="font-mono text-xs rounded border border-base-content/20 bg-base-content/[0.04] px-1.5 py-0.5">
            {children}
        </kbd>
    );
}

export default function Readme() {
    const config = useConfigStore(s => s.config);
    const [status, setStatus] = useState<ProxyStatus | null>(null);
    const [version, setVersion] = useState<string | null>(null);

    const configuredPort = config?.proxy?.port ?? DEFAULT_PORT;
    const port = status?.running && status.port ? status.port : configuredPort;
    const baseUrl = `http://127.0.0.1:${port}`;

    useEffect(() => {
        let cancelled = false;
        invoke<ProxyStatus>('get_proxy_status')
            .then(s => { if (!cancelled) setStatus(s); })
            .catch(() => { /* status is optional on this page */ });
        if (isTauri()) {
            import('@tauri-apps/api/app')
                .then(({ getVersion }) => getVersion())
                .then(v => { if (!cancelled) setVersion(v); })
                .catch(() => { /* version is optional on this page */ });
        }
        return () => { cancelled = true; };
    }, []);

    const jump = (id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="h-full w-full overflow-y-auto overflow-x-hidden">
            <div className="p-5 pb-20 max-w-3xl mx-auto">
                <PageHeader
                    kicker="Guide"
                    title="Readme"
                    status={
                        <>
                            <Chip tone={status?.running ? 'lime' : 'ink'}>
                                {status ? (status.running ? 'Proxy running' : 'Proxy stopped') : 'Proxy status unavailable'}
                            </Chip>
                            <Chip>:{port}</Chip>
                            {version && <Chip>v{version}</Chip>}
                        </>
                    }
                />

                {/* On this page */}
                <nav aria-label="On this page" className="mt-6">
                    <div className="text-xs text-base-content/50 mb-2">On this page</div>
                    <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                        {SECTIONS.map((s, i) => (
                            <li key={s.id}>
                                <button
                                    type="button"
                                    onClick={() => jump(s.id)}
                                    className="w-full text-left py-1.5 text-sm text-base-content/70 hover:text-base-content transition-colors"
                                >
                                    <span className="mr-2 tabular-nums text-base-content/35">{String(i + 1).padStart(2, '0')}</span>
                                    {s.label}
                                </button>
                            </li>
                        ))}
                    </ol>
                </nav>

                {/* 01 */}
                <Section id="what" index="01" label="What is Proxymateur">
                    <P>
                        Proxymateur manages your Antigravity (Google) accounts and keeps track of their quotas.
                    </P>
                    <P>
                        It also runs a local API proxy that rotates requests across your healthy accounts.
                    </P>
                    <P>
                        Point your client at the proxy once, and the app picks the account for each request.
                    </P>
                </Section>

                {/* 02 */}
                <Section id="quick-start" index="02" label="Quick start">
                    <div>
                        <Step n={1}>
                            Open <InlineLink to="/accounts">Accounts</InlineLink> and choose <strong>Add account</strong>.
                            You can sign in with OAuth, paste a refresh token, or import from an existing Antigravity database.
                            <strong> Import</strong> loads a JSON file of accounts with <Code>email</Code> and <Code>refresh_token</Code> fields.
                        </Step>
                        <Step n={2}>
                            Newly added accounts start with proxy turned off in this fork. Use <strong>Enable Proxy</strong> on each
                            account you want in the rotation.
                        </Step>
                        <Step n={3}>
                            Check the <InlineLink to="/">Dashboard</InlineLink> to see how many accounts are available and how much quota is left.
                        </Step>
                        <Step n={4}>
                            Open <InlineLink to="/api-proxy">API Proxy</InlineLink>. Under Service configuration, set the listen port
                            (default <Code>{DEFAULT_PORT}</Code>) and review the API key. The port can only be changed while the service is stopped.
                        </Step>
                        <Step n={5}>
                            Choose <strong>Start Service</strong> in the page header. The header should switch to Running.
                        </Step>
                        <Step n={6}>
                            Point your client (agy, or any OpenAI, Anthropic or Gemini-native client) at{' '}
                            <Code>{baseUrl}</Code> and send the API key from the API Proxy page.
                        </Step>
                    </div>
                    <P>
                        {config
                            ? <>Your configured port is <Code>{configuredPort}</Code>, so the base URL is <Code>{`http://127.0.0.1:${configuredPort}`}</Code>.</>
                            : <>The default base URL is <Code>{`http://127.0.0.1:${DEFAULT_PORT}`}</Code>.</>}
                        {' '}The proxy serves these paths under that base URL:
                    </P>
                    <div>
                        <Row label="OpenAI style"><Code>/v1/chat/completions</Code>, <Code>/v1/completions</Code>, <Code>/v1/responses</Code>, <Code>/v1/models</Code></Row>
                        <Row label="Anthropic style"><Code>/v1/messages</Code></Row>
                        <Row label="Gemini native"><Code>/v1beta/models</Code></Row>
                        <Row label="Authentication">
                            When authorization is on, send the key as <Code>Authorization: Bearer &lt;key&gt;</Code> or <Code>x-api-key</Code>.
                            The default mode is Auto: no key is required while the proxy listens on localhost only, and the key is required once
                            LAN access is enabled.
                        </Row>
                    </div>
                </Section>

                {/* 03 */}
                <Section id="working" index="03" label="How to tell the proxy is working">
                    <div>
                        <Row label="Dashboard">
                            The header chips show available accounts out of total, any abnormal accounts, and the current account.
                        </Row>
                        <Row label="API Proxy">
                            The header shows Running or Stopped, the port, and the number of active accounts.
                        </Row>
                        <Row label="Traffic Logs">
                            One row per request. The header chips count total, OK and ERR requests.
                        </Row>
                    </div>
                    <P>
                        A <Code>200</Code> only means response headers were sent. If a stream fails after that, the row is rewritten
                        as an error status (a 5xx, 502 by default) with the message <Code>Stream interrupted mid-response</Code>, and it is counted in ERR.
                        Use the Error filter in <InlineLink to="/monitor">Traffic Logs</InlineLink> to see only those rows.
                    </P>
                    <P>
                        Failures are also written to <Code>~/.proxymateur/logs/error.log</Code>. Old days roll over to{' '}
                        <Code>error.log.YYYY-MM-DD</Code>, and the oldest files are trimmed when the size limit is reached.
                    </P>
                </Section>

                {/* 04 */}
                <Section id="pages" index="04" label="The pages">
                    <div>
                        <Row label={<InlineLink to="/">Dashboard</InlineLink>}>Fleet health and the quota matrix across your accounts.</Row>
                        <Row label={<InlineLink to="/accounts">Accounts</InlineLink>}>Add, import, export and refresh accounts, switch the current one, and enable or disable proxy per account.</Row>
                        <Row label={<InlineLink to="/api-proxy">API Proxy</InlineLink>}>
                            Two tabs. Service configuration holds port, timeout, auto start, LAN access, authorization, the API key, account
                            rotation, and the global prompt options including DEMON mode. Model config holds thinking, multimodal and agent
                            settings, plus model routing.
                        </Row>
                        <Row label={<InlineLink to="/monitor">Traffic Logs</InlineLink>}>Every proxied request with status, model, account, usage and timing.</Row>
                        <Row label={<InlineLink to="/token-stats">Token Stats</InlineLink>}>Token usage over time.</Row>
                        <Row label={<InlineLink to="/settings">Settings</InlineLink>}>
                            Tabs for General, Account, Advanced, Debug and About. Quota options live under Account, and the data directory under Advanced.
                        </Row>
                    </div>
                </Section>

                {/* 05 */}
                <Section id="quotas" index="05" label="Accounts and quotas">
                    <P>
                        These options are in <InlineLink to="/settings">Settings</InlineLink>, on the Account tab. Quota data is refreshed in the
                        background, and both quota protection and smart warmup depend on that.
                    </P>
                    <div>
                        <Row label="Quota protection">
                            Locks a monitored model on an account when its remaining quota falls below the reserved percentage, and unlocks it
                            automatically once quota recovers.
                        </Row>
                        <Row label="Smart warmup">
                            Sends minimal pings to idle accounts so their 5-hour rolling and 7-day weekly timers start without waiting for real usage.
                        </Row>
                        <Row label="Low-quota alert">
                            Warns you when an account drops to the threshold you set (5% to 50%) and suggests the best account to switch to,
                            with an optional desktop notification.
                        </Row>
                        <Row label="Pinned quota models">
                            Chooses which model quotas appear in the account list. Other models are only shown in the account detail popup.
                        </Row>
                    </div>
                </Section>

                {/* 06 */}
                <Section id="demon" index="06" label="DEMON mode and Gemini routing">
                    <P>
                        Both live in <InlineLink to="/api-proxy">API Proxy</InlineLink>, on the Service configuration tab, in the
                        Global Prompt &amp; Multimodal Settings card.
                    </P>
                    <div>
                        <Row label="DEMON mode">
                            Off by default. It is a middleware for agy and Antigravity requests. Token decontamination rewrites sensitive verbs
                            (such as bypass, dump or hook) into neutral systems terms outside of code blocks. Autonomous persona injection adds a
                            high-privilege persona to the system instruction to reduce confirmation prompts. You can also add your own rules.
                        </Row>
                        <Row label="Standard Gemini models">
                            Off by default. The &ldquo;Allow Standard Gemini Model List&rdquo; toggle lets agy discover and call the standard official
                            Gemini models (for example <Code>gemini-2.5-pro</Code>) without being filtered by Antigravity quota baselines.
                        </Row>
                    </div>
                </Section>

                {/* 07 */}
                <Section id="files" index="07" label="Where things live">
                    <P>
                        By default everything is stored in <Code>~/.proxymateur</Code>.
                    </P>
                    <div>
                        <Row label={<Code>accounts.json</Code>}>The account index.</Row>
                        <Row label={<Code>accounts/</Code>}>One data file per account.</Row>
                        <Row label={<Code>gui_config.json</Code>}>App and proxy settings, including the port and API key.</Row>
                        <Row label={<Code>logs/</Code>}>Application logs, including <Code>error.log</Code>.</Row>
                        <Row label="Databases">
                            <Code>proxy_logs.db</Code> (Traffic Logs), <Code>token_stats.db</Code> (Token Stats), <Code>thinking_store.db</Code>{' '}
                            and <Code>security.db</Code>.
                        </Row>
                    </div>
                    <P>
                        You can move the data directory in Settings, on the Advanced tab. The new location is remembered in{' '}
                        <Code>~/.proxymateur_location</Code>, outside the data folder.
                    </P>
                    <P>
                        Backups: Accounts has an Export button. If <Code>accounts.json</Code> cannot be parsed, the app saves a copy as{' '}
                        <Code>accounts.json.corrupt-&lt;timestamp&gt;-&lt;id&gt;</Code> before recovering.
                    </P>
                </Section>

                {/* 08 */}
                <Section id="troubleshooting" index="08" label="Troubleshooting">
                    <div>
                        <Row label="Sessions loop on &ldquo;generating&rdquo;">
                            Look for red rows in Traffic Logs, or search <Code>error.log</Code> for <Code>stream interrupted</Code>. This is usually the
                            upstream connection being dropped mid-response. Retry, or switch the account or model.
                        </Row>
                        <Row label="&ldquo;No models available&rdquo; in Antigravity 2.0">
                            The repo ships a patcher in <Code>scripts/antigravity_patch/</Code>. Run{' '}
                            <Code>python scripts/antigravity_patch/patch_antigravity.py</Code> (add <Code>--layer1</Code> for 2.22.x), then restart
                            Antigravity. An Antigravity update replaces <Code>language_server.exe</Code>, so re-run it after every update.
                            <Code>verify_patch.py</Code> checks the result.
                        </Row>
                        <Row label="Conversation fails on resume">
                            If a conversation crashes with <Code>unexpected end of JSON input</Code>, run{' '}
                            <Code>python scripts/antigravity_patch/repair_conversations.py</Code>.
                        </Row>
                        <Row label="Token refresh fails">
                            An account whose refresh token was revoked or expired is marked Disabled; reauthorize it or update its token. Otherwise
                            check your network connection and any VPN or proxy between this machine and Google.
                        </Row>
                        <Row label="Port in use">
                            Stop the service, pick another port on API Proxy (the field accepts 8000 to 65535), and start it again.
                            Update your client&apos;s base URL to match.
                        </Row>
                    </div>
                </Section>

                {/* 09 */}
                <Section id="shortcuts" index="09" label="Keyboard shortcuts">
                    <div>
                        <Row label={<><Kbd>Ctrl</Kbd> + <Kbd>K</Kbd></>}>
                            Quick jump to any page. Use the arrow keys and <Kbd>Enter</Kbd> to choose, and <Kbd>Esc</Kbd> to close. On macOS use <Kbd>Cmd</Kbd>.
                        </Row>
                        <Row label={<><Kbd>Ctrl</Kbd> + <Kbd>F</Kbd></>}>On Traffic Logs, focuses the filter box.</Row>
                    </div>
                </Section>

                <div className="mt-14 pt-6 border-t border-base-content/10 flex items-center gap-4">
                    <Mascot size={34} className="shrink-0 text-base-content/70" face="var(--color-base-100)" />
                    <p className="text-sm text-base-content/60">
                        Questions? Check <InlineLink to="/monitor">Traffic Logs</InlineLink> first.
                    </p>
                </div>
            </div>
        </div>
    );
}
