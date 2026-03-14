document.addEventListener('DOMContentLoaded', () => {

// ============================================================
// CONSTANTS
// ============================================================
const MAP_LAYERS      = 6;
const BASE_NODE_HP    = 20;
const HP_PER_LAYER    = 8;
const MAX_HAND_SIZE   = 5;
const DRAW_ON_START   = 5;
const DRAW_ON_TURN    = 3;
const MAX_TRACE       = 20;
const TRACE_WARNING   = 14;
const MAP_PAD_X       = 40;
const MAP_PAD_Y       = 35;
const DRAG_THRESHOLD  = 6;
const TOPBAR_H        = 30;
const TASKBAR_H       = 40;

// Tier: based on highest-tier tool played this run
const TIERS = {
    0: { label: 'Script Kiddie', color: '#7fff7f' },
    1: { label: 'Grey Hat',      color: '#7fb8ff' },
    2: { label: 'Black Hat',     color: '#c87fff' },
    3: { label: 'Ghost',         color: '#ff7fb8' },
};

// Node types with ICE retaliation, weaknesses, software flavour
const NODE_TYPES = {
    workstation: { label: 'Workstation',   icon: '💻', software: 'Windows 10',     cve: 'CVE-2021-34527', weakness: ['social','login'],          icePerTurn: 1, maxHp: 18, reward: { data: 4  } },
    web_server:  { label: 'Web Server',    icon: '🌐', software: 'Apache 2.2.22',  cve: 'CVE-2021-41773', weakness: ['web','exploit'],           icePerTurn: 1, maxHp: 28, reward: { data: 7  } },
    database:    { label: 'Database',      icon: '🗄', software: 'MySQL 5.6',      cve: 'CVE-2016-6662',  weakness: ['web','exploit','scan'],    icePerTurn: 2, maxHp: 35, reward: { data: 15 } },
    firewall:    { label: 'Firewall',      icon: '🔥', software: 'Cisco ASA',      cve: 'CVE-2019-0708',  weakness: ['network','zero-day'],      icePerTurn: 3, maxHp: 45, reward: { data: 5  } },
    mail_server: { label: 'Mail Server',   icon: '📧', software: 'Exchange 2010',  cve: 'CVE-2021-26855', weakness: ['social','login','exploit'], icePerTurn: 1, maxHp: 25, reward: { data: 10 } },
    iot_device:  { label: 'IoT Device',    icon: '📷', software: 'Busybox 1.28',   cve: 'CVE-2020-8864',  weakness: ['brute','login','scan'],    icePerTurn: 1, maxHp: 12, reward: { data: 3  } },
    vpn_gateway: { label: 'VPN Gateway',   icon: '🔐', software: 'Juniper SRX',    cve: 'CVE-2021-22893', weakness: ['exploit','mitm'],          icePerTurn: 2, maxHp: 38, reward: { data: 6  } },
    core_router: { label: 'Core Router',   icon: '⚙', software: 'Cisco IOS 15.2', cve: 'CVE-2018-0171',  weakness: ['network','exploit'],       icePerTurn: 3, maxHp: 55, reward: { data: 20 }, isBoss: true },
};
const NODE_TYPE_KEYS = ['workstation','web_server','database','firewall','mail_server','iot_device','vpn_gateway'];

// ============================================================
// BREACH PHASES
// ============================================================
// Each node breach has 4 ordered phases. Cards belong to one or more phases.
// Playing a card in its correct phase: full effect.
// Playing out of phase: half damage, +1 extra trace (wasted effort).
// Advancing the phase requires playing enough phase-appropriate cards.
// Some nodes skip phases (IoT has no ESCALATE).

const PHASES = {
    RECON:    { id: 'RECON',    label: 'RECON',    color: '#7fb8ff', desc: 'Enumerate the target. Reveal weaknesses. Set up your attack.' },
    ACCESS:   { id: 'ACCESS',   label: 'ACCESS',   color: '#7fff7f', desc: 'Gain initial foothold. Login exploits and injection attacks.' },
    ESCALATE: { id: 'ESCALATE', label: 'ESCALATE', color: '#c87fff', desc: 'Elevate privileges. Deeper system access. Buffs stack here.' },
    EXFIL:    { id: 'EXFIL',    label: 'EXFIL',    color: '#ff7fb8', desc: 'Extract data. Finish the breach. Data multipliers active.' },
};

// Phase sequences per node type. IoT skips ESCALATE (simple device).
// Firewall has brutal ESCALATE. Core has all phases at full weight.
const NODE_PHASE_SEQUENCES = {
    workstation: ['RECON','ACCESS','EXFIL'],
    web_server:  ['RECON','ACCESS','ESCALATE','EXFIL'],
    database:    ['RECON','ACCESS','ESCALATE','EXFIL'],
    firewall:    ['RECON','ESCALATE','EXFIL'],
    mail_server: ['RECON','ACCESS','EXFIL'],
    iot_device:  ['RECON','ACCESS','EXFIL'],
    vpn_gateway: ['RECON','ACCESS','ESCALATE','EXFIL'],
    core_router: ['RECON','ACCESS','ESCALATE','EXFIL'],
};

// How many phase-appropriate cards needed to advance to next phase
const PHASE_ADVANCE_THRESHOLD = 2;

// ============================================================
// TOOL DATABASE  (20 tools across 4 tiers)
// ============================================================
// effect(ctx) can call:
//   ctx.dealDamage(n)   — damage firewall (respects buffs/weaknesses)
//   ctx.addTrace(n)     — add/remove trace (respects shields/effects)
//   ctx.gainData(n)     — add data to run total
//   ctx.addStealth(n)   — build stealth (reduces trace pressure)
//   ctx.revealWeakness()
//   ctx.addTurnEffect(key, val)
//   ctx.addPersistentEffect(key, val)
//   ctx.backfire(chance, traceAmount) — random chance of extra trace

const TOOL_DB = {
    // ── TIER 0 — Script Kiddie ─────────────────────────────────
    ping_flood: {
        id: 'ping_flood', phase: 'ACCESS', name: 'Ping Flood', tier: 0, icon: '📡',
        desc: 'Overwhelm target with ICMP packets.',
        flavour: '"works on my machine"',
        tags: ['noise','blunt'], traceCost: 1, dmg: 4,
        effect(ctx) { ctx.dealDamage(4); ctx.addTrace(2); }
    },
    default_login: {
        id: 'default_login', phase: 'ACCESS', name: 'Default Creds', tier: 0, icon: '🔑',
        desc: 'Try admin/admin. Surprisingly effective.',
        flavour: 'password: password',
        tags: ['social','login'], traceCost: 0, dmg: 3,
        effect(ctx) { ctx.dealDamage(3); }
    },
    nmap_scan: {
        id: 'nmap_scan', phase: 'RECON', name: 'nmap Scan', tier: 0, icon: '🗺',
        desc: 'Enumerate open ports. Reveals node weaknesses.',
        flavour: '-sV -sC --script vuln',
        tags: ['recon','scan'], traceCost: 1, dmg: 2,
        effect(ctx) { ctx.dealDamage(2); ctx.revealWeakness(); }
    },
    dict_attack: {
        id: 'dict_attack', phase: 'ACCESS', name: 'Dict Attack', tier: 0, icon: '📖',
        desc: 'Brute-force with rockyou.txt.',
        flavour: '"14 million passwords. One of them is \'qwerty123\'."',
        tags: ['brute','login'], traceCost: 1, dmg: 5,
        effect(ctx) { ctx.dealDamage(5); ctx.addTrace(1); }
    },
    phishing_link: {
        id: 'phishing_link', phase: 'RECON', name: 'Phishing Link', tier: 0, icon: '🎣',
        desc: 'Send a convincing fake login page.',
        flavour: '"Your account has been compromised. Click here."',
        tags: ['social','distract'], traceCost: 0, dmg: 3,
        effect(ctx) { ctx.dealDamage(3); ctx.gainData(1); ctx.addTurnEffect('nextTraceCheap', 1); }
    },
    pastebin_exploit: {
        id: 'pastebin_exploit', phase: 'ACCESS', name: 'Pastebin Exploit', tier: 0, icon: '📋',
        desc: 'Deploy a sketchy script. Might backfire.',
        flavour: '# written by xXx_H4ck3r_xXx in 2009',
        tags: ['noise','script'], traceCost: 0, dmg: 2,
        effect(ctx) { ctx.dealDamage(2); ctx.backfire(0.4, 2); }
    },
    // ── TIER 1 — Grey Hat ──────────────────────────────────────
    sql_injection: {
        id: 'sql_injection', phase: 'ACCESS', name: 'SQL Injection', tier: 1, icon: '💉',
        desc: "Classic ' OR 1=1. Bypasses weak auth.",
        flavour: "Robert'); DROP TABLE students;--",
        tags: ['exploit','web','login'], traceCost: 1, dmg: 7,
        effect(ctx) { ctx.dealDamage(7); ctx.gainData(2); }
    },
    port_knock: {
        id: 'port_knock', phase: 'RECON', name: 'Port Knock', tier: 1, icon: '🚪',
        desc: 'Hidden service. +2 stealth, reveals weakness.',
        flavour: '1337, 7331, 9001. Knock knock.',
        tags: ['recon','stealth'], traceCost: 1, dmg: 0,
        effect(ctx) { ctx.addStealth(2); ctx.revealWeakness(); }
    },
    arp_spoof: {
        id: 'arp_spoof', phase: 'ESCALATE', name: 'ARP Spoof', tier: 1, icon: '🌐',
        desc: 'Poison ARP cache. Intercept traffic.',
        flavour: 'Who has 192.168.1.1? I do now.',
        tags: ['mitm','network'], traceCost: 2, dmg: 6,
        effect(ctx) { ctx.dealDamage(6); ctx.gainData(3); ctx.addTrace(1); }
    },
    metasploit: {
        id: 'metasploit', phase: 'ACCESS', name: 'Metasploit', tier: 1, icon: '🔫',
        desc: 'Load a known CVE exploit. Point and shoot.',
        flavour: 'use exploit/multi/handler',
        tags: ['exploit','blunt'], traceCost: 2, dmg: 9,
        effect(ctx) { ctx.dealDamage(9); ctx.addTrace(3); }
    },
    pkt_sniffer: {
        id: 'pkt_sniffer', phase: 'RECON', name: 'Packet Sniffer', tier: 1, icon: '🦈',
        desc: 'Capture plaintext credentials from the wire.',
        flavour: 'tcpdump -i eth0 -w capture.pcap',
        tags: ['recon','mitm','scan'], traceCost: 1, dmg: 4,
        effect(ctx) { ctx.dealDamage(4); ctx.gainData(4); }
    },
    rootkit: {
        id: 'rootkit', phase: 'ESCALATE', name: 'Rootkit', tier: 1, icon: '🌱',
        desc: 'Persistent access. Reduce future trace costs.',
        flavour: 'chmod 777 /etc/shadow',
        tags: ['persist','stealth'], traceCost: 3, dmg: 5,
        effect(ctx) { ctx.dealDamage(5); ctx.addPersistentEffect('traceCostReduction', 1); }
    },
    // ── TIER 2 — Black Hat ─────────────────────────────────────
    zero_day: {
        id: 'zero_day', phase: 'ESCALATE', name: 'Zero Day', tier: 2, icon: '💀',
        desc: 'Unpublished CVE. Devastating. Single use.',
        flavour: 'Costs $250k on the dark web. Worth it.',
        tags: ['exploit','zero-day'], traceCost: 3, dmg: 15,
        singleUse: true,
        effect(ctx) { ctx.dealDamage(15); ctx.addTrace(1); }
    },
    vpn_chain: {
        id: 'vpn_chain', phase: null, name: 'VPN Chain', tier: 2, icon: '🔗',
        desc: 'Route through 7 proxies. Half trace this turn.',
        flavour: 'Good luck tracing through Moldova.',
        tags: ['stealth','network'], traceCost: 2, dmg: 0,
        effect(ctx) { ctx.addTurnEffect('halfTrace', true); ctx.addStealth(3); }
    },
    ransomware: {
        id: 'ransomware', phase: 'EXFIL', name: 'Ransomware', tier: 2, icon: '💰',
        desc: 'Encrypt their data. Massive damage and data haul.',
        flavour: 'YOUR FILES ARE ENCRYPTED. Send 2 BTC.',
        tags: ['exploit','noise','blunt'], traceCost: 4, dmg: 12,
        effect(ctx) { ctx.dealDamage(12); ctx.gainData(8); ctx.addTrace(4); }
    },
    social_engineer: {
        id: 'social_engineer', phase: 'ACCESS', name: 'Social Engineer', tier: 2, icon: '🎭',
        desc: 'Call the help desk. Convince them to reset password.',
        flavour: '"Hi, this is Dave from IT."',
        tags: ['social','login','stealth'], traceCost: 2, dmg: 8,
        effect(ctx) { ctx.dealDamage(8); }
    },
    kernel_exploit: {
        id: 'kernel_exploit', phase: 'ESCALATE', name: 'Kernel Exploit', tier: 2, icon: '⚙',
        desc: 'Priv-esc to root. Double damage on next tool.',
        flavour: 'dirty pipe, dirty cow, dirty money',
        tags: ['exploit','escalate'], traceCost: 3, dmg: 6,
        effect(ctx) { ctx.dealDamage(6); ctx.addTurnEffect('doubleDamage', true); }
    },
    // ── TIER 3 — Ghost ─────────────────────────────────────────
    apt_implant: {
        id: 'apt_implant', phase: 'EXFIL', name: 'APT Implant', tier: 3, icon: '👻',
        desc: 'Nation-state malware. Silent. Devastating.',
        flavour: 'Attributed to no one. Paid by everyone.',
        tags: ['exploit','stealth','persist'], traceCost: 4, dmg: 20,
        effect(ctx) { ctx.dealDamage(20); /* no trace */ }
    },
    supply_chain: {
        id: 'supply_chain', phase: 'EXFIL', name: 'Supply Chain', tier: 3, icon: '🏭',
        desc: 'Compromise upstream vendor. Damages all nodes.',
        flavour: 'SolarWinds. XZ utils. Pick your poison.',
        tags: ['network','stealth','persist'], traceCost: 5, dmg: 10,
        effect(ctx) { ctx.dealDamage(10); ctx.damageAllNodes(4); }
    },
    memory_scrape: {
        id: 'memory_scrape', phase: 'EXFIL', name: 'Memory Scrape', tier: 3, icon: '🧠',
        desc: 'Extract secrets from RAM. Maximum data.',
        flavour: 'cleartext passwords everywhere, apparently',
        tags: ['exploit','recon'], traceCost: 3, dmg: 8,
        effect(ctx) { ctx.dealDamage(8); ctx.gainData(12); }
    },
};

// Starting deck
const STARTER_DECK = [
    // RECON (2)
    'nmap_scan', 'phishing_link',
    // ACCESS (3)
    'default_login', 'dict_attack', 'ping_flood',
    // ESCALATE (1) — one so it's not totally absent early
    'pastebin_exploit',  // low-tier stand-in; gets replaced by real escalate tools via upgrades
    // EXFIL (1)
    'pkt_sniffer',       // recon/data — doubles as EXFIL setup
    // Utility (1)
    'phishing_link',     // second copy for consistency
];
// Note: pastebin_exploit is ACCESS-phase really; we're treating it as the
// "desperation" card for early ESCALATE until the player builds their deck.
// pkt_sniffer is RECON-phase but gains data — useful in EXFIL as off-phase.

// ============================================================
// SYNERGIES  (trigger when both tools played in same breach)
// ============================================================
const SYNERGIES = [
    {
        ids: ['nmap_scan','metasploit'],
        name: 'Recon → Strike',
        desc: '+6 damage, -1 trace',
        bonus(ctx) { ctx.dealDamage(6); ctx.addTrace(-1); }
    },
    {
        ids: ['nmap_scan','sql_injection'],
        name: 'Port → Inject',
        desc: '+4 damage, +3 data',
        bonus(ctx) { ctx.dealDamage(4); ctx.gainData(3); }
    },
    {
        ids: ['phishing_link','social_engineer'],
        name: 'Full Con',
        desc: '+5 damage, no trace this turn',
        bonus(ctx) { ctx.dealDamage(5); ctx.addTurnEffect('noTrace', true); }
    },
    {
        ids: ['default_login','sql_injection'],
        name: 'Login Bypass',
        desc: '+8 data',
        bonus(ctx) { ctx.gainData(8); }
    },
    {
        ids: ['vpn_chain','apt_implant'],
        name: 'Ghost Protocol',
        desc: 'Zero trace this turn, +10 damage',
        bonus(ctx) { ctx.addTurnEffect('noTrace', true); ctx.dealDamage(10); }
    },
    {
        ids: ['kernel_exploit','zero_day'],
        name: 'Root 0day',
        desc: 'Triple damage on next card',
        bonus(ctx) { ctx.addTurnEffect('tripleDamage', true); }
    },
    {
        ids: ['rootkit','apt_implant'],
        name: 'Deep Persist',
        desc: '-2 trace cost on all tools, +5 stealth',
        bonus(ctx) { ctx.addPersistentEffect('traceCostReduction', 2); ctx.addStealth(5); }
    },
    {
        ids: ['pkt_sniffer','arp_spoof'],
        name: 'MitM Setup',
        desc: '+10 data, reveal all weaknesses',
        bonus(ctx) { ctx.gainData(10); ctx.revealWeakness(); }
    },
    {
        ids: ['dict_attack','default_login'],
        name: 'Brute Combo',
        desc: '+3 damage per brute/login card in hand',
        bonus(ctx) {
            const count = state.hand.filter(tid => {
                const t = TOOL_DB[tid];
                return t && t.tags.some(tag => ['brute','login'].includes(tag));
            }).length;
            ctx.dealDamage(3 * Math.max(1, count));
        }
    },
    {
        ids: ['ransomware','supply_chain'],
        name: 'Total Chaos',
        desc: 'Deal 8 to all nodes, +5 data',
        bonus(ctx) { ctx.damageAllNodes(8); ctx.gainData(5); ctx.addTrace(3); }
    },
];

// ============================================================
// UPGRADES  (offered between nodes, pick one)
// ============================================================
const UPGRADES = [
    { id: 'dark_vpn',       name: 'Dark VPN',        desc: 'All trace gains reduced by 1 (min 0).', apply(s) { s.persistentEffects.traceMinus1 = true; } },
    { id: 'tor_routing',    name: 'Tor Routing',     desc: 'Start each breach with 2 stealth.', apply(s) { s.persistentEffects.startStealth2 = true; } },
    { id: 'cached_exploit', name: 'Cached Exploit',  desc: 'First tool each breach costs 0 trace.', apply(s) { s.persistentEffects.firstToolFree = true; } },
    { id: 'recon_dump',     name: 'Recon Dump',      desc: 'Draw 1 extra card each turn.', apply(s) { s.persistentEffects.drawPlus1 = true; } },
    { id: 'compiled_tool',  name: 'Compiled Tool',   desc: 'All tools deal +2 damage.', apply(s) { s.persistentEffects.globalDmgPlus2 = true; } },
    { id: 'exploit_db',     name: 'ExploitDB Sub',   desc: 'Tier 1 tools deal double damage.', apply(s) { s.persistentEffects.tier1Double = true; } },
    { id: 'insider_tip',    name: 'Insider Tip',     desc: 'All weaknesses pre-revealed on map.', apply(s) { s.nodes.forEach(n => { n.weaknessRevealed = true; }); } },
    { id: 'burner_account', name: 'Burner Account',  desc: 'Once per run: clear 5 trace.', apply(s) { s.persistentEffects.burnerAvailable = true; } },
    { id: 'zero_cool',      name: 'Zero Cool',       desc: 'Synergy bonuses deal 50% more damage.', apply(s) { s.persistentEffects.synergyBoost = true; } },
    { id: 'black_market',   name: 'Black Market',    desc: 'Get an extra tool offer after each node.', apply(s) { s.persistentEffects.extraToolOffer = true; } },
];

// ============================================================
// STATE
// ============================================================
let state = {
    // Map
    currentNodeId:    null,
    targetId:         null,
    nodes:            [],
    reachable:        new Set(),

    // Run-wide
    globalTrace:      0,
    runData:          0,
    stealth:          0,
    tier:             0,          // 0-3
    nodesBreached:    0,
    upgrades:         [],
    persistentEffects: {},
    // OPSEC cooldowns (nodes since last use)
    opsecCooldowns:   { goDark: 0, logWipe: 0, pivot: 0 },
    opsecCharges:     { goDark: 1, logWipe: 1, pivot: 1 }, // available uses

    // Deck (IDs, not objects)
    deck:             [...STARTER_DECK],

    // Per-breach
    upgradeOpen:      false,
    breachActive:     false,
    // Phase system
    phaseSequence:    [],   // e.g. ['RECON','ACCESS','ESCALATE','EXFIL']
    phaseIndex:       0,    // index into phaseSequence
    phaseProgress:    0,    // cards played in current phase
    exfilMultiplier:  1.0,  // grows as recon/escalate phases are completed
    nodeType:         null,
    firewall:         0,
    firewallMax:      0,
    nodeWeaknessRevealed: false,
    toolsUsedThisBreach: [],      // tool ids used this breach (for synergy detection)
    activeSynergies:  [],
    drawPile:         [],
    discardPile:      [],
    hand:             [],

    // Per-turn
    turnEffects:      {},
    cardsPlayedThisTurn: [],
    firstToolPlayedThisBreach: true,
};

// ============================================================
// UTILITIES
// ============================================================
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function getTierLabel() { return (TIERS[state.tier] || TIERS[0]).label; }
function getTierColor() { return (TIERS[state.tier] || TIERS[0]).color; }

function currentPhase() {
    return state.phaseSequence[state.phaseIndex] || 'EXFIL';
}

function isCardOnPhase(tool) {
    if (!tool.phase) return true; // phase-agnostic (utility cards)
    return tool.phase === currentPhase();
}

// Manually skip to next phase — costs +2 trace, no bonus draw.
// Gives the player an escape hatch when stuck without on-phase cards.
function skipPhase() {
    if (state.phaseIndex >= state.phaseSequence.length - 1) return; // already at EXFIL
    state.globalTrace = Math.min(MAX_TRACE, state.globalTrace + 2);
    showFloatingText('PHASE SKIPPED +2 TRACE', 'trace');
    advancePhase(); // advance without the bonus draw
    updateBreachUI();
    renderHand();
}

function advancePhase() {
    if (state.phaseIndex < state.phaseSequence.length - 1) {
        state.phaseIndex++;
        state.phaseProgress = 0;
        const newPhase = currentPhase();
        showFloatingText(`► ${newPhase}`, 'data');
        // Bonus for completing RECON: reveal weakness + exfil multiplier
        if (newPhase === 'ACCESS') {
            state.nodeWeaknessRevealed = true;
            const node = state.nodes.find(n => n.id === state.targetId);
            if (node) node.weaknessRevealed = true;
            showFloatingText('WEAKNESSES REVEALED', 'data');
        }
        // Bonus for completing ESCALATE: exfil multiplier
        if (newPhase === 'EXFIL') {
            state.exfilMultiplier = 1.5;
            showFloatingText('EXFIL ×1.5 DATA', 'data');
        }
        updateBreachUI();
        renderHand(); // re-render so phase indicators update
    }
}

function getNodeType(layer) {
    if (layer === MAP_LAYERS - 1) return 'core_router';
    return NODE_TYPE_KEYS[Math.floor(Math.random() * NODE_TYPE_KEYS.length)];
}

function handDrawCount() {
    return DRAW_ON_TURN + (state.persistentEffects.drawPlus1 ? 1 : 0);
}

// ============================================================
// CARD EXECUTION CONTEXT
// ============================================================
// All tool effects call methods on this object — clean separation
// between "what the card does" and "how the game applies it".
function buildCtx(toolId) {
    const ntype  = NODE_TYPES[state.nodeType];
    const tool   = TOOL_DB[toolId];

    return {
        dealDamage(amount) {
            let dmg = amount;
            // Persistent buffs
            if (state.persistentEffects.globalDmgPlus2) dmg += 2;
            if (state.persistentEffects.tier1Double && tool.tier === 1) dmg *= 2;
            // Turn effects (consumed on use)
            if (state.turnEffects.doubleDamage)  { dmg *= 2;  delete state.turnEffects.doubleDamage; }
            if (state.turnEffects.tripleDamage)  { dmg *= 3;  delete state.turnEffects.tripleDamage; }
            // Out-of-phase penalty: half damage
            if (state.turnEffects.outOfPhase)    { dmg = Math.floor(dmg / 2); delete state.turnEffects.outOfPhase; }
            // Weakness bonus (only if revealed)
            if (state.nodeWeaknessRevealed && ntype && tool.tags.some(t => ntype.weakness.includes(t))) {
                dmg = Math.floor(dmg * 1.5);
            }
            state.firewall = Math.max(0, state.firewall - dmg);
            showFloatingText(`-${dmg} HP`, 'dmg');
        },
        addTrace(amount) {
            if (state.turnEffects.noTrace) return;
            if (state.turnEffects.halfTrace) amount = Math.ceil(amount / 2);
            if (state.persistentEffects.traceMinus1) amount = Math.max(0, amount - 1);
            state.globalTrace = Math.min(MAX_TRACE, state.globalTrace + Math.max(0, amount));
        },
        gainData(amount) {
            const boosted = Math.floor(amount * state.exfilMultiplier);
            state.runData += boosted;
            showFloatingText(`+${boosted} DATA`, 'data');
        },
        addStealth(amount) {
            state.stealth += amount;
        },
        revealWeakness() {
            state.nodeWeaknessRevealed = true;
            const node = state.nodes.find(n => n.id === state.targetId);
            if (node) node.weaknessRevealed = true;
        },
        addTurnEffect(key, val) {
            state.turnEffects[key] = val;
        },
        addPersistentEffect(key, val) {
            state.persistentEffects[key] = (state.persistentEffects[key] || 0) + val;
        },
        damageAllNodes(amount) {
            state.nodes.forEach(n => {
                if (n.id !== state.targetId && !n.cleared) {
                    n.hp = Math.max(0, n.hp - amount);
                }
            });
        },
        backfire(chance, traceAmount) {
            if (Math.random() < chance) {
                state.globalTrace = Math.min(MAX_TRACE, state.globalTrace + traceAmount);
                showFloatingText(`BACKFIRE +${traceAmount} TRACE`, 'trace');
            }
        },
    };
}

// ============================================================
// SYNERGY CHECK
// ============================================================
function checkSynergies() {
    const played = state.toolsUsedThisBreach;
    SYNERGIES.forEach(syn => {
        if (syn.ids.every(id => played.includes(id))) {
            // Already triggered this breach?
            if (state.activeSynergies.find(s => s.ids.join() === syn.ids.join())) return;
            state.activeSynergies.push(syn);
            // Apply bonus with optional synergyBoost
            const bonusCtx = buildCtx(syn.ids[0]);
            const origDeal = bonusCtx.dealDamage.bind(bonusCtx);
            if (state.persistentEffects.synergyBoost) {
                bonusCtx.dealDamage = (n) => origDeal(Math.floor(n * 1.5));
            }
            syn.bonus(bonusCtx);
            showSynergyFlash(syn);
            updateBreachUI();
        }
    });
}

// ============================================================
// PLAY A CARD
// ============================================================
function playCard(handIndex) {
    const toolId = state.hand[handIndex];
    if (!toolId) return;
    const tool = TOOL_DB[toolId];
    if (!tool) return;

    // Calculate trace cost (persistent reductions, first-tool-free, nextTraceCheap)
    let traceCost = tool.traceCost;
    if (state.persistentEffects.firstToolFree && state.firstToolPlayedThisBreach) {
        traceCost = 0;
        state.firstToolPlayedThisBreach = false;
    }
    if (state.turnEffects.nextTraceCheap) {
        traceCost = Math.max(0, traceCost - state.turnEffects.nextTraceCheap);
        delete state.turnEffects.nextTraceCheap;
    }
    if (state.persistentEffects.traceCostReduction) {
        traceCost = Math.max(0, traceCost - state.persistentEffects.traceCostReduction);
    }

    // Apply base trace cost (before effects that might modify it)
    const ctx = buildCtx(toolId);
    ctx.addTrace(traceCost);

    // Phase check: is this card being played in its correct phase?
    const onPhase = isCardOnPhase(tool);
    if (!onPhase) {
        // Out-of-phase penalty: +1 trace, damage will be halved in buildCtx
        ctx.addTrace(1);
        ctx.addTurnEffect('outOfPhase', true);
        showFloatingText('OUT OF PHASE -50% DMG', 'trace');
    }

    // Execute the tool
    tool.effect(ctx);

    // Accumulate phase progress — advancement happens at END TURN so the
    // player can play their full hand before the phase shifts.
    if (onPhase && tool.phase) {
        state.phaseProgress++;
    }

    // EXFIL phase: gainData calls are multiplied
    // (handled in buildCtx via state.exfilMultiplier)

    // Track plays
    state.hand.splice(handIndex, 1);
    state.discardPile.push(toolId);
    state.cardsPlayedThisTurn.push(toolId);
    if (!state.toolsUsedThisBreach.includes(toolId)) {
        state.toolsUsedThisBreach.push(toolId);
    }

    // Single-use cards are removed from deck
    if (tool.singleUse) {
        const di = state.deck.indexOf(toolId);
        if (di !== -1) state.deck.splice(di, 1);
    }

    // Update player tier based on highest-tier tool played
    state.tier = Math.max(state.tier, tool.tier);

    checkSynergies();

    // Check win
    if (state.firewall <= 0) {
        setTimeout(() => breachSuccess(), 400);
        return;
    }
    // Check trace game-over
    if (state.globalTrace >= MAX_TRACE) {
        setTimeout(() => breachFail('trace'), 600);
        return;
    }

    updateBreachUI();
    renderHand();
}

// ============================================================
// END TURN
// ============================================================
function endTurn() {
    // IDS counterattack: if trace is high, node partially recovers
    const ntype  = NODE_TYPES[state.nodeType];
    let iceTrace = ntype ? ntype.icePerTurn : 1;
    // Pivot upgrade: halve ICE this breach
    if (state.persistentEffects.halfIceThisBreach) iceTrace = Math.ceil(iceTrace / 2);
    // Stealth absorbs ICE
    if (state.stealth > 0) {
        iceTrace = Math.max(0, iceTrace - state.stealth);
        state.stealth = Math.max(0, state.stealth - 1);
    }
    state.globalTrace = Math.min(MAX_TRACE, state.globalTrace + iceTrace);
    if (iceTrace > 0) showFloatingText(`ICE +${iceTrace} TRACE`, 'trace');

    // IDS heal: node recovers HP proportional to trace level
    const idsHeal = Math.floor(state.globalTrace / 5);
    if (idsHeal > 0) {
        state.firewall = Math.min(state.firewallMax, state.firewall + idsHeal);
        showFloatingText(`IDS +${idsHeal} HP`, 'ice');
    }

    // Discard hand, clear turn state
    state.discardPile.push(...state.hand);
    state.hand = [];
    state.turnEffects = {};
    state.cardsPlayedThisTurn = [];

    // Check trace game-over
    if (state.globalTrace >= MAX_TRACE) {
        breachFail('trace');
        return;
    }

    // Phase advancement: check if we earned enough progress this turn
    let phaseAdvanced = false;
    if (state.phaseProgress >= PHASE_ADVANCE_THRESHOLD) {
        advancePhase();
        phaseAdvanced = true;
    }

    // Draw cards — bonus draw if phase just advanced (reward for good sequencing)
    drawCards(handDrawCount() + (phaseAdvanced ? 1 : 0));
    updateBreachUI();
}

// ============================================================
// RETREAT
// ============================================================
function retreat() {
    // +2 trace penalty, leave node intact
    state.globalTrace = Math.min(MAX_TRACE, state.globalTrace + 2);
    endBreach(false);
}

// ============================================================
// BREACH OUTCOMES
// ============================================================
function breachSuccess() {
    const node   = state.nodes.find(n => n.id === state.targetId);
    const ntype  = NODE_TYPES[state.nodeType];

    state.nodesBreached++;
    state.breachActive = false;
    if (node) { node.cleared = true; node.hp = 0; }
    if (ntype) state.runData += ntype.reward.data;

    // Unlock next reachable nodes
    state.reachable = computeReachable(state.currentNodeId);

    // Check if boss node cleared = win
    if (ntype && ntype.isBoss) {
        endBreach(true, true);
        showEndScreen(true);
        return;
    }

    endBreach(true);
    // Show upgrade window
    setTimeout(() => openUpgradeScreen(), 300);
}

function breachFail(reason) {
    state.breachActive = false;
    endBreach(false);
    if (reason === 'trace') {
        showEndScreen(false);
    }
}

function endBreach(success) {
    state.breachActive = false;
    delete state.persistentEffects.halfIceThisBreach;
    const breachWin = document.getElementById('win-breach');
    if (breachWin) {
        breachWin.classList.add('hidden');
        if (winState['win-breach']) {
            winState['win-breach'].minimised = false;
            winState['win-breach'].maximised = false;
        }
        const tab = getTab('win-breach');
        if (tab) tab.remove(); // breach ends = window gone, not minimised
    }
    if (success) {
        state.currentNodeId = state.targetId;
        state.reachable = computeReachable(state.currentNodeId);
        // Replenish one OPSEC charge of each type between nodes
        Object.keys(state.opsecCharges).forEach(k => {
            state.opsecCharges[k] = Math.min(2, state.opsecCharges[k] + 1);
        });
    }
    updateGlobalUI();
    renderMap();
}

// ============================================================
// UPGRADE SCREEN
// ============================================================
function openUpgradeScreen() {
    state.upgradeOpen = true;
    buildUpgradeWindow();
    openWindow('win-upgrade');
}

// Pending selections (not committed until Continue is clicked)
let pendingUpgradeId  = null;
let pendingToolId     = null;

function buildUpgradeWindow() {
    pendingUpgradeId = null;
    pendingToolId    = null;

    const container = document.getElementById('upgrade-choices');
    const toolContainer = document.getElementById('tool-reward-choices');
    if (!container || !toolContainer) return;

    const available = UPGRADES.filter(u => !state.upgrades.includes(u.id));
    const offers    = shuffle(available).slice(0, 3);

    container.innerHTML = '';
    offers.forEach(upg => {
        const btn = document.createElement('button');
        btn.className = 'upgrade-card';
        btn.dataset.upgId = upg.id;
        btn.innerHTML = `<div class="upg-name">${upg.name}</div><div class="upg-desc">${upg.desc}</div>`;
        btn.addEventListener('click', () => {
            // Switchable: just mark pending, don't apply yet
            pendingUpgradeId = upg.id;
            container.querySelectorAll('.upgrade-card').forEach(b => {
                b.classList.toggle('selected', b.dataset.upgId === upg.id);
            });
        });
        container.appendChild(btn);
    });

    const maxTier = Math.min(3, state.tier + 1);
    const eligibleTools = Object.values(TOOL_DB).filter(t =>
        t.tier <= maxTier && !state.deck.includes(t.id)
    );
    const extraOffer  = state.persistentEffects.extraToolOffer ? 1 : 0;
    const toolOffers  = shuffle(eligibleTools).slice(0, 3 + extraOffer);

    toolContainer.innerHTML = '';
    toolOffers.forEach(tool => {
        const btn = document.createElement('button');
        btn.className = 'tool-card-mini';
        btn.dataset.toolId = tool.id;
        btn.innerHTML = `
            <div class="card-topbar">
                <span class="card-badge badge-dmg">${tool.dmg || '—'}</span>
                <span class="card-tier-label" style="color:${TIERS[tool.tier].color}">${TIERS[tool.tier].label}</span>
                <span class="card-badge ${tool.traceCost === 0 ? 'badge-free' : 'badge-trace'}">${tool.traceCost}</span>
            </div>
            <div class="card-icon">${tool.icon}</div>
            <div class="card-name">${tool.name}</div>
            <div class="card-desc">${tool.desc}</div>
            <div class="card-tags">${tool.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>`;
        btn.addEventListener('click', () => {
            // Switchable: just mark pending
            pendingToolId = tool.id;
            toolContainer.querySelectorAll('button').forEach(b => {
                b.classList.toggle('selected', b.dataset.toolId === tool.id);
            });
        });
        toolContainer.appendChild(btn);
    });
}

function closeUpgradeAndContinue() {
    // Commit pending selections now
    if (pendingUpgradeId) {
        const upg = UPGRADES.find(u => u.id === pendingUpgradeId);
        if (upg) { state.upgrades.push(upg.id); upg.apply(state); }
    }
    if (pendingToolId) {
        state.deck.push(pendingToolId);
    }
    pendingUpgradeId = null;
    pendingToolId    = null;

    state.upgradeOpen = false;
    const win = document.getElementById('win-upgrade');
    if (win) win.classList.add('hidden');
    const tab = getTab('win-upgrade');
    if (tab) tab.remove();
    shakeWindow('win-map', false); // clear any shake
}

// ============================================================
// END SCREENS
// ============================================================
function showEndScreen(win) {
    const el = document.getElementById('win-endscreen');
    if (!el) return;
    document.getElementById('end-title').textContent    = win ? 'ACCESS GRANTED' : 'TRACED';
    document.getElementById('end-subtitle').textContent = win
        ? 'Crown Jewel compromised. Run complete.'
        : 'TRACE MAXED — connection terminated.';
    document.getElementById('end-data').textContent     = state.runData;
    document.getElementById('end-nodes').textContent    = state.nodesBreached;
    document.getElementById('end-tier').textContent     = getTierLabel();
    el.classList.remove('hidden');
    openWindow('win-endscreen');
}

function startNewRun() {
    // Reset all breach/run state, keep UI
    const win = document.getElementById('win-endscreen');
    if (win) win.classList.add('hidden');
    const tab = getTab('win-endscreen');
    if (tab) tab.remove();

    state.globalTrace   = 0;
    state.runData       = 0;
    state.stealth       = 0;
    state.tier          = 0;
    state.nodesBreached = 0;
    state.upgrades      = [];
    state.persistentEffects = {};
    state.deck          = [...STARTER_DECK];
    state.breachActive  = false;
    state.opsecCooldowns = { goDark: 0, logWipe: 0, pivot: 0 };
    state.opsecCharges   = { goDark: 1, logWipe: 1, pivot: 1 };

    updateGlobalUI();
    generateWebMap();
}

function useBurner() {
    if (!state.persistentEffects.burnerAvailable || state.persistentEffects.burnerUsed) return;
    state.persistentEffects.burnerUsed = true;
    state.globalTrace = Math.max(0, state.globalTrace - 5);
    showFloatingText('-5 TRACE (BURNER)', 'data');
    updateGlobalUI();
    updateBreachUI();
}

// ============================================================
// DRAW CARDS
// ============================================================
function drawCards(count) {
    const maxHand = MAX_HAND_SIZE + (state.persistentEffects.drawPlus1 ? 1 : 0);
    for (let i = 0; i < count; i++) {
        // Reshuffle discard into draw pile whenever draw pile is empty
        if (state.drawPile.length === 0) {
            if (state.discardPile.length === 0) break; // truly nothing left
            state.drawPile    = shuffle([...state.discardPile]);
            state.discardPile = [];
        }
        if (state.hand.length >= maxHand) break;
        state.hand.push(state.drawPile.pop());
    }
    renderHand();
}

// ============================================================
// RENDER HAND
// ============================================================
function renderHand() {
    const container = document.getElementById('hand');
    if (!container) return;
    container.innerHTML = '';
    const ntype = NODE_TYPES[state.nodeType];

    if (state.hand.length === 0) {
        container.innerHTML = '<div class="empty-hand">No cards — end turn to draw.</div>';
        return;
    }

    state.hand.forEach((tid, idx) => {
        const tool = TOOL_DB[tid];
        if (!tool) return;

        // Is this tool effective against current node?
        const isEffective = state.nodeWeaknessRevealed && ntype && tool.tags.some(t => ntype.weakness.includes(t));

        // Actual trace cost after reductions
        let cost = tool.traceCost;
        if (state.persistentEffects.traceCostReduction) cost = Math.max(0, cost - state.persistentEffects.traceCostReduction);
        if (state.persistentEffects.firstToolFree && state.firstToolPlayedThisBreach) cost = 0;

        // Phase alignment
        const onPhase   = isCardOnPhase(tool);
        const phaseInfo = tool.phase ? PHASES[tool.phase] : null;

        // Compute actual damage: apply persistent buffs, phase penalty, weakness
        let actualDmg = tool.dmg;
        if (actualDmg > 0) {
            if (state.persistentEffects.globalDmgPlus2) actualDmg += 2;
            if (state.persistentEffects.tier1Double && tool.tier === 1) actualDmg *= 2;
            if (!onPhase) actualDmg = Math.floor(actualDmg / 2); // out-of-phase penalty preview
            if (isEffective) actualDmg = Math.floor(actualDmg * 1.5);
        }

        // Build damage badge content
        let dmgBadgeContent;
        if (actualDmg <= 0) {
            dmgBadgeContent = tool.dmg > 0 ? '—' : '—';
        } else if (!onPhase && tool.dmg > 0) {
            dmgBadgeContent = `${actualDmg}<span class="dmg-base-hint">${tool.dmg}</span>`;
        } else if (isEffective && actualDmg !== tool.dmg) {
            dmgBadgeContent = `${actualDmg}<span class="dmg-base-hint">${tool.dmg}</span>`;
        } else {
            dmgBadgeContent = `${actualDmg}`;
        }

        // Card class: effective (weakness), on-phase, off-phase
        let cardClass = 'card';
        if (!onPhase && tool.phase)  cardClass += ' card-offphase';
        else if (isEffective)        cardClass += ' card-effective';
        else if (onPhase && tool.phase) cardClass += ' card-onphase';

        // Phase badge colour and label
        const phaseBadge = phaseInfo
            ? `<span class="card-phase-badge" style="color:${phaseInfo.color};border-color:${phaseInfo.color}22">${phaseInfo.label}</span>`
            : `<span class="card-phase-badge card-phase-any">ANY</span>`;

        const dmgBadgeClass = !onPhase && tool.phase ? 'badge-dmg badge-dmg-offphase'
                            : isEffective             ? 'badge-dmg badge-dmg-boosted'
                            : 'badge-dmg';

        const offPhaseWarning = (!onPhase && tool.phase)
            ? `<div class="card-offphase-warning">⚠ ${currentPhase()} phase — -50% DMG</div>`
            : '';

        const card = document.createElement('div');
        card.className = cardClass;
        card.innerHTML = `
            <div class="card-topbar">
                <span class="card-badge ${dmgBadgeClass}" title="Damage">${dmgBadgeContent}</span>
                <span class="card-tier-label" style="color:${TIERS[tool.tier].color}">${TIERS[tool.tier].label}</span>
                <span class="card-badge ${cost === 0 ? 'badge-free' : 'badge-trace'}" title="Trace cost">${cost === 0 ? '0' : cost}</span>
            </div>
            ${phaseBadge}
            ${offPhaseWarning}
            <div class="card-icon">${tool.icon}</div>
            <strong class="card-name">${tool.name}</strong>
            <p class="card-desc">${tool.desc}</p>
            <div class="card-tags">${tool.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
            ${tool.flavour ? `<p class="card-flavour">${tool.flavour}</p>` : ''}`;
        card.addEventListener('click', () => playCard(idx));
        container.appendChild(card);
    });
}

// ============================================================
// BREACH UI UPDATE
// ============================================================
function updateBreachUI() {
    const fw    = Math.max(0, state.firewall);
    const fwMax = state.firewallMax || 1;
    const el    = id => document.getElementById(id);

    if (el('firewall-val'))      el('firewall-val').textContent = fw;
    if (el('target-fwall-max'))  el('target-fwall-max').textContent = fwMax;
    if (el('firewall-bar'))      el('firewall-bar').style.width = `${Math.round((fw / fwMax) * 100)}%`;
    if (el('trace-val'))         el('trace-val').textContent = `${state.globalTrace}/${MAX_TRACE}`;
    if (el('trace-bar')) {
        const pct = Math.min(100, Math.round((state.globalTrace / MAX_TRACE) * 100));
        el('trace-bar').style.width = pct + '%';
        el('trace-bar').style.background = state.globalTrace >= TRACE_WARNING ? '#ff3a3a' : 'var(--pink)';
    }
    if (el('deck-count'))        el('deck-count').textContent = state.drawPile.length;
    if (el('discard-count'))     el('discard-count').textContent = state.discardPile.length;
    if (el('breach-data-val'))   el('breach-data-val').textContent = state.runData;
    if (el('breach-stealth-val'))el('breach-stealth-val').textContent = state.stealth;

    // Weakness
    const weakEl = el('target-weak');
    if (weakEl) {
        const ntype = NODE_TYPES[state.nodeType];
        if (state.nodeWeaknessRevealed && ntype) {
            weakEl.textContent = ntype.weakness.join(' · ');
            weakEl.style.color = 'var(--cyan)';
        } else {
            weakEl.textContent = '???';
            weakEl.style.color = '#444';
        }
    }

    // Tools used this breach
    const usedEl = el('tools-used-list');
    if (usedEl) {
        usedEl.textContent = state.toolsUsedThisBreach.length
            ? [...new Set(state.toolsUsedThisBreach)].map(tid => TOOL_DB[tid]?.name || tid).join(', ')
            : '—';
    }

    // Active synergies
    const synEl = el('active-synergies');
    if (synEl) {
        synEl.innerHTML = state.activeSynergies.map(s =>
            `<div class="synergy-item">⚡ <strong>${s.name}</strong> — ${s.desc}</div>`
        ).join('');
    }

    // Burner button
    const burnerBtn = el('burner-btn');
    if (burnerBtn) {
        const avail = state.persistentEffects.burnerAvailable && !state.persistentEffects.burnerUsed;
        burnerBtn.style.display = avail ? 'inline-block' : 'none';
    }

    // Phase track
    const phaseTrack = el('phase-track');
    if (phaseTrack && state.phaseSequence.length) {
        phaseTrack.innerHTML = state.phaseSequence.map((phId, i) => {
            const ph     = PHASES[phId];
            const done   = i < state.phaseIndex;
            const active = i === state.phaseIndex;
            const prog   = active ? state.phaseProgress : 0;
            const cls    = done ? 'phase-step done' : active ? 'phase-step active' : 'phase-step future';
            // Show progress pips for active phase
            let pip = '';
            if (active) {
                const pips = Array.from({length: PHASE_ADVANCE_THRESHOLD}, (_, j) =>
                    `<span class="phase-dot${j < prog ? ' filled' : ''}"></span>`
                ).join('');
                pip = `<span class="phase-pips">${pips}</span>`;
            } else if (done) {
                pip = '<span class="phase-pip">✓</span>';
            }
            return `<div class="${cls}" style="--ph-color:${ph.color}" title="${ph.desc}">${ph.label}${pip}</div>`;
        }).join('<div class="phase-arrow">›</div>');
    }

    // Skip button: hide when already on last phase (EXFIL)
    const skipBtn = el('btn-skip-phase');
    if (skipBtn) {
        const atLast = state.phaseIndex >= (state.phaseSequence.length - 1);
        skipBtn.style.display = atLast ? 'none' : 'inline-block';
    }
}

// ============================================================
// GLOBAL UI (top OS bar)
// ============================================================
function updateGlobalUI() {
    const el = id => document.getElementById(id);
    if (el('player-tier')) {
        el('player-tier').textContent = getTierLabel();
        el('player-tier').style.color = getTierColor();
    }
    if (el('global-trace')) {
        el('global-trace').textContent = `${state.globalTrace}/${MAX_TRACE}`;
        el('global-trace').style.color = state.globalTrace >= TRACE_WARNING ? '#ff3a3a' : 'var(--pink)';
    }
    if (el('nodes-breached'))  el('nodes-breached').textContent  = state.nodesBreached;
    if (el('run-data-global')) el('run-data-global').textContent = state.runData;
}

// ============================================================
// FLOATING TEXT
// ============================================================
function showFloatingText(text, type) {
    const desktop = document.getElementById('desktop');
    const breach  = document.getElementById('win-breach');
    if (!desktop || !breach || breach.classList.contains('hidden')) return;

    const rect = breach.getBoundingClientRect();
    const el   = document.createElement('div');
    el.className = `floating-text float-${type}`;
    el.textContent = text;
    el.style.left = (rect.left + rect.width / 2 + (Math.random() * 80 - 40)) + 'px';
    el.style.top  = (rect.top  + 60 + Math.random() * 40) + 'px';
    desktop.appendChild(el);
    setTimeout(() => el.remove(), 1200);
}

function showSynergyFlash(syn) {
    const desktop = document.getElementById('desktop');
    if (!desktop) return;
    const el = document.createElement('div');
    el.className = 'synergy-flash';
    el.innerHTML = `⚡ SYNERGY: <strong>${syn.name}</strong><br><span>${syn.desc}</span>`;
    desktop.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

// ============================================================
// WINDOW LOCK / SHAKE
// ============================================================
// When upgrade or breach is active, the map window shakes and
// ignores node clicks. Call shakeWindow(id) to trigger the animation.

function shakeWindow(id, doShake = true) {
    const win = document.getElementById(id);
    if (!win) return;
    if (!doShake) { win.classList.remove('window-shake'); return; }
    win.classList.remove('window-shake');
    // Force reflow so animation restarts
    void win.offsetWidth;
    win.classList.add('window-shake');
    setTimeout(() => win.classList.remove('window-shake'), 500);
}

function isMapLocked() {
    // Map is locked if upgrade window is open OR a breach is active
    return state.upgradeOpen || state.breachActive;
}

// ============================================================
// BREACH SETUP
// ============================================================
function startBreach(node) {
    const ntype = NODE_TYPES[node.nodeType] || NODE_TYPES.web_server;
    state.breachActive              = true;
    state.targetId                  = node.id;
    state.nodeType                  = node.nodeType;
    state.firewall                  = node.hp;
    state.firewallMax               = ntype.maxHp;
    state.nodeWeaknessRevealed      = node.weaknessRevealed || false;
    state.toolsUsedThisBreach       = [];
    state.activeSynergies           = [];
    state.cardsPlayedThisTurn       = [];
    state.turnEffects               = {};
    state.firstToolPlayedThisBreach = true;
    state.drawPile                  = shuffle(state.deck);
    state.discardPile               = [];
    state.hand                      = [];
    // Phase system setup
    state.phaseSequence  = NODE_PHASE_SEQUENCES[node.nodeType] || ['RECON','ACCESS','EXFIL'];
    state.phaseIndex     = 0;
    state.phaseProgress  = 0;
    state.exfilMultiplier = 1.0;
    if (state.persistentEffects.startStealth2) state.stealth += 2;

    // Populate target panel
    const el = id => document.getElementById(id);
    if (el('target-name'))    el('target-name').textContent  = ntype.label;
    if (el('target-soft'))    el('target-soft').textContent  = ntype.software;
    if (el('target-cve'))     el('target-cve').textContent   = ntype.cve;
    if (el('target-icon-el')) el('target-icon-el').textContent = ntype.icon;
    if (el('target-fwall-max')) el('target-fwall-max').textContent = ntype.maxHp;

    consumePivotIfActive();
    updateBreachUI();

    // Position breach window to the right of the map window (with a small overlap)
    const mapWin  = document.getElementById('win-map');
    const wa      = workArea();
    const mapRight = mapWin.offsetLeft + mapWin.offsetWidth - 10; // slight overlap
    const bw      = 550; // breach default width
    const openL   = Math.min(mapRight, wa.left + wa.width - bw - 10);
    // Reset relX/relY so placeWindow uses our computed position
    winState['win-breach'].relX = null;
    winState['win-breach'].relY = null;
    const openT = mapWin.offsetTop;
    // Temporarily set inline style before openWindow places it
    const breachEl = document.getElementById('win-breach');
    breachEl.style.left = Math.round(Math.max(wa.left + 10, openL)) + 'px';
    breachEl.style.top  = Math.round(openT) + 'px';
    // Store as rel so resize works
    winState['win-breach'].relX = (Math.max(wa.left + 10, openL) - wa.left) / wa.width;
    winState['win-breach'].relY = (openT - wa.top) / wa.height;

    openWindow('win-breach');
    drawCards(DRAW_ON_START);
}

// ============================================================
// WINDOW SYSTEM  (unchanged from previous)
// ============================================================
const winState = {};

function workArea() {
    return { top: TOPBAR_H, left: 0, width: window.innerWidth, height: window.innerHeight - TOPBAR_H - TASKBAR_H };
}

function saveRelPos(id) {
    const win = document.getElementById(id); const wa = workArea();
    winState[id].relX = (win.offsetLeft - wa.left) / wa.width;
    winState[id].relY = (win.offsetTop  - wa.top)  / wa.height;
}

let _autoPlaceSlot = 0;
function placeWindow(id) {
    const win = document.getElementById(id); const wa = workArea();
    const ww = win.offsetWidth || 550; const wh = win.offsetHeight || 500;
    let rx = winState[id].relX, ry = winState[id].relY;
    if (rx === null || ry === null) {
        const defX = parseFloat(win.dataset.defaultRelX), defY = parseFloat(win.dataset.defaultRelY);
        if (!isNaN(defX) && !isNaN(defY)) { rx = defX; ry = defY; }
        else { const s = _autoPlaceSlot++ % 6; rx = 0.04 + s*0.04; ry = 0.04 + s*0.04; }
    }
    let l = wa.left + rx*wa.width, t = wa.top + ry*wa.height;
    l = Math.max(wa.left, Math.min(wa.left+wa.width-Math.min(ww,wa.width), l));
    t = Math.max(wa.top,  Math.min(wa.top+wa.height-Math.min(wh,wa.height), t));
    win.style.left = Math.round(l)+'px'; win.style.top = Math.round(t)+'px';
}

function openWindow(id, opts={}) {
    const win = document.getElementById(id); if (!win) return;
    if (opts.restoreSize) {
        const s = winState[id].closeRect;
        if (s) { if(s.width) win.style.width=s.width; if(s.height) win.style.height=s.height; if(s.relX!=null)winState[id].relX=s.relX; if(s.relY!=null)winState[id].relY=s.relY; }
    }
    win.classList.remove('hidden','minimised'); winState[id].minimised = false;
    placeWindow(id); saveRelPos(id); bringToFront(win);
    ensureTab(id);
    const tab = getTab(id); if (tab) tab.classList.add('tab-active');
    hideDesktopIcon(id);
    if (id === 'win-map') setTimeout(() => rescaleMapToWrapper(), 50);
}

function initWindows() {
    document.querySelectorAll('.window').forEach(win => {
        const id = win.id;
        winState[id] = { minimised:false, maximised:false, savedRect:null, closeRect:null, relX:null, relY:null };
        if (!win.classList.contains('hidden') && !win.classList.contains('minimised')) saveRelPos(id);
        // Only create a taskbar tab for windows that are visible on load.
        // Hidden windows get their tab created the first time openWindow() is called.
        const isInitiallyVisible = !win.classList.contains('hidden') && !win.classList.contains('minimised');
        if (isInitiallyVisible) {
            ensureTab(id);
            getTab(id).classList.add('tab-active');
        }
        const wcMin   = win.querySelector('.wc-min');
        const wcMax   = win.querySelector('.wc-max');
        const wcClose = win.querySelector('.wc-close');
        if (wcMin)   wcMin.addEventListener('click',   e=>{e.stopPropagation();minimiseWindow(id);});
        if (wcMax)   wcMax.addEventListener('click',   e=>{e.stopPropagation();toggleMaximise(id);});
        if (wcClose) wcClose.addEventListener('click', e=>{e.stopPropagation(); if(win.dataset.closeable==='true')closeWindow(id);});
        attachDragBehaviour(win.querySelector('.window-header'), {
            onDragStart(){if(winState[id].maximised)unmaximiseWindow(id); win.classList.add('dragging'); bringToFront(win);},
            onDrag(dx,dy){win.style.left=`${win.offsetLeft+dx}px`;win.style.top=`${win.offsetTop+dy}px`;},
            onDragEnd(){win.classList.remove('dragging'); saveRelPos(id);},
            onClick(){}, ignoreSelector:'.wc-btn',
        });
    });
}

function getTab(winId){ return document.querySelector(`.taskbar-tab[data-win-id="${winId}"]`); }

function ensureTab(winId) {
    if (getTab(winId)) return; // already exists
    const win = document.getElementById(winId);
    const tab = document.createElement('button');
    tab.className    = 'taskbar-tab';
    tab.textContent  = win.dataset.tabLabel || winId;
    tab.dataset.winId = winId;
    tab.addEventListener('click', () => restoreWindow(winId));
    document.getElementById('taskbar').appendChild(tab);
}
function bringToFront(win){ let m=10; document.querySelectorAll('.window').forEach(w=>{const z=parseInt(w.style.zIndex||10);if(z>m)m=z;}); win.style.zIndex=m+1; }
function minimiseWindow(id){ const win=document.getElementById(id); win.classList.add('minimised'); winState[id].minimised=true; const t=getTab(id); if(t)t.classList.remove('tab-active'); }
function restoreWindow(id){ openWindow(id); }
function closeWindow(id){
    const win=document.getElementById(id); if(winState[id].maximised)unmaximiseWindow(id);
    winState[id].closeRect={left:win.style.left||win.offsetLeft+'px',top:win.style.top||win.offsetTop+'px',width:win.style.width||'',height:win.style.height||'',relX:winState[id].relX,relY:winState[id].relY};
    win.classList.add('hidden'); winState[id].minimised=false; winState[id].maximised=false;
    const t=getTab(id); if(t)t.remove(); showDesktopIcon(id);
}
function toggleMaximise(id){ winState[id].maximised?unmaximiseWindow(id):maximiseWindow(id); }
function maximiseWindow(id){
    const win=document.getElementById(id); const wa=workArea();
    winState[id].savedRect={left:win.style.left,top:win.style.top,width:win.style.width,height:win.style.height};
    winState[id].maximised=true; win.classList.remove('dragging');
    win.style.left=`${wa.left}px`; win.style.top=`${wa.top}px`; win.style.width=`${wa.width}px`; win.style.height=`${wa.height}px`;
    bringToFront(win); if(id==='win-map')setTimeout(()=>generateWebMap(),200);
}
function unmaximiseWindow(id){
    const win=document.getElementById(id); const s=winState[id].savedRect;
    winState[id].maximised=false;
    if(s){win.style.left=s.left;win.style.top=s.top;win.style.width=s.width||'';win.style.height=s.height||'';}
    if(id==='win-map')setTimeout(()=>generateWebMap(),200);
}

// Desktop icons
const iconPositions={'win-map':{x:20,y:20}};
const iconLastTap={};
function showDesktopIcon(winId){
    const win=document.getElementById(winId); if(!win.dataset.icon)return;
    if(document.getElementById(`icon-${winId}`))return;
    const el=document.createElement('div'); el.className='desktop-icon'; el.id=`icon-${winId}`;
    const pos=iconPositions[winId]||{x:20,y:20}; el.style.left=`${pos.x}px`; el.style.top=`${pos.y}px`;
    el.innerHTML=`<div class="desktop-icon-glyph"></div><div class="desktop-icon-label">${win.dataset.icon}</div>`;
    let t=null;
    el.addEventListener('click',()=>{if(t){clearTimeout(t);t=null;el.classList.remove('selected');restoreWindow(winId);}else{el.classList.add('selected');t=setTimeout(()=>{t=null;},300);}});
    el.addEventListener('touchend',e=>{const now=Date.now(),last=iconLastTap[winId]||0;if(now-last<350){e.preventDefault();restoreWindow(winId);}iconLastTap[winId]=now;});
    document.getElementById('desktop-icons').appendChild(el);
}
function hideDesktopIcon(winId){const el=document.getElementById(`icon-${winId}`);if(el)el.remove();}

// ============================================================
// DRAG HELPER
// ============================================================
function attachDragBehaviour(el, options) {
    let sX,sY,lX,lY,drag,moved;
    function ps(cx,cy,tgt){if(options.ignoreSelector&&tgt.closest(options.ignoreSelector))return;sX=lX=cx;sY=lY=cy;drag=false;moved=false;}
    function pm(cx,cy){if(sX===undefined)return;if(!drag&&Math.hypot(cx-sX,cy-sY)>DRAG_THRESHOLD){drag=true;moved=true;if(options.onDragStart)options.onDragStart();}if(drag&&options.onDrag)options.onDrag(cx-lX,cy-lY);lX=cx;lY=cy;}
    function pe(cx,cy){if(sX===undefined)return;if(drag){if(options.onDragEnd)options.onDragEnd();}else if(!moved){if(options.onClick)options.onClick(cx,cy);}sX=sY=undefined;drag=false;}
    el.addEventListener('mousedown',e=>{ps(e.clientX,e.clientY,e.target);const mo=e=>{pm(e.clientX,e.clientY);},mu=e=>{pe(e.clientX,e.clientY);document.removeEventListener('mousemove',mo);document.removeEventListener('mouseup',mu);};document.addEventListener('mousemove',mo);document.addEventListener('mouseup',mu);});
    el.addEventListener('touchstart',e=>{const t=e.touches[0];ps(t.clientX,t.clientY,e.target);},{passive:true});
    el.addEventListener('touchmove',e=>{const t=e.touches[0];pm(t.clientX,t.clientY);},{passive:true});
    el.addEventListener('touchend',e=>{const t=e.changedTouches[0];pe(t.clientX,t.clientY);},{passive:true});
}

// ============================================================
// MAP PAN
// ============================================================
let panX=0,panY=0;
function initMapPan(){
    const w=document.getElementById('map-wrapper');
    attachDragBehaviour(w,{
        onDragStart(){w.classList.add('panning');},
        onDrag(dx,dy){panX+=dx;panY+=dy;applyPan();},
        onDragEnd(){w.classList.remove('panning');},
        onClick(){},
    });
}
function applyPan(){document.getElementById('map-connections').style.transform=`translate(${panX}px,${panY}px)`;document.getElementById('node-layer').style.transform=`translate(${panX}px,${panY}px)`;}
function resetPan(){panX=0;panY=0;applyPan();}

// ============================================================
// GRAPH HELPERS
// ============================================================
function seg(p1,p2,p3,p4){const dx1=p2.x-p1.x,dy1=p2.y-p1.y,dx2=p4.x-p3.x,dy2=p4.y-p3.y,d=dx1*dy2-dy1*dx2;if(Math.abs(d)<1e-10)return false;const t=((p3.x-p1.x)*dy2-(p3.y-p1.y)*dx2)/d,u=((p3.x-p1.x)*dy1-(p3.y-p1.y)*dx1)/d,e=0.01;return t>e&&t<1-e&&u>e&&u<1-e;}
function wouldCross(sId,dId){const s=state.nodes.find(n=>n.id===sId),d=state.nodes.find(n=>n.id===dId);for(const n of state.nodes)for(const t of n.targets){if(n.id===sId||n.id===dId||t===sId||t===dId)continue;const a=state.nodes.find(x=>x.id===n.id),b=state.nodes.find(x=>x.id===t);if(seg(s,d,a,b))return true;}return false;}
function computeReachable(startId){const v=new Set(),q=[startId];while(q.length){const id=q.shift();if(v.has(id))continue;v.add(id);const n=state.nodes.find(x=>x.id===id);if(n)n.targets.forEach(t=>q.push(t));}return v;}

// ============================================================
// MAP GENERATION
// ============================================================
function rescaleMapToWrapper(){
    if(!state.nodes.length){generateWebMap();return;}
    const w=document.getElementById('map-wrapper'),W=w.clientWidth||580,H=w.clientHeight||400;
    const uW=W-MAP_PAD_X*2,uH=H-MAP_PAD_Y*2,lc={};
    state.nodes.forEach(n=>{lc[n.layer]=(lc[n.layer]||0)+1;});
    state.nodes.forEach(n=>{const c=lc[n.layer],i=state.nodes.filter(x=>x.layer===n.layer).indexOf(n);n.x=Math.round(MAP_PAD_X+(n.layer/(MAP_LAYERS-1))*uW);n.y=Math.round(MAP_PAD_Y+(uH/(c+1))*(i+1));});
    renderMap();
}

function generateWebMap(){
    resetPan();
    const w=document.getElementById('map-wrapper'),W=w.clientWidth||580,H=w.clientHeight||400,uW=W-MAP_PAD_X*2,uH=H-MAP_PAD_Y*2;
    state.nodes=[];
    for(let l=0;l<MAP_LAYERS;l++){
        const ep=l===0||l===MAP_LAYERS-1,cnt=ep?1:Math.floor(Math.random()*2)+2,x=Math.round(MAP_PAD_X+(l/(MAP_LAYERS-1))*uW);
        for(let i=0;i<cnt;i++){
            const nt = l===MAP_LAYERS-1 ? 'core_router' : getNodeType(l);
            const ndata = NODE_TYPES[nt];
            state.nodes.push({id:`N${l}-${i}`,layer:l,x,y:Math.round(MAP_PAD_Y+(uH/(cnt+1))*(i+1)),
                hp: ndata ? ndata.maxHp : BASE_NODE_HP + l*HP_PER_LAYER,
                nodeType:nt, targets:[], cleared:false, weaknessRevealed:false,
            });
        }
    }
    for(let l=0;l<MAP_LAYERS-1;l++){
        const cur=state.nodes.filter(n=>n.layer===l),nxt=state.nodes.filter(n=>n.layer===l+1);
        cur.forEach(s=>{
            const c=[...nxt].sort((a,b)=>Math.abs(a.y-s.y)-Math.abs(b.y-s.y));
            let added=false;for(const d of c){if(!wouldCross(s.id,d.id)){s.targets.push(d.id);added=true;break;}}
            if(!added&&c.length)s.targets.push(c[0].id);
            if(Math.random()<0.45&&nxt.length>1){for(const d of c){if(!s.targets.includes(d.id)&&!wouldCross(s.id,d.id)){s.targets.push(d.id);break;}}}
        });
    }
    for(let l=1;l<MAP_LAYERS;l++){
        const layer=state.nodes.filter(n=>n.layer===l),prev=state.nodes.filter(n=>n.layer===l-1);
        layer.forEach(d=>{
            if(!prev.some(p=>p.targets.includes(d.id))){
                const s=[...prev].sort((a,b)=>Math.abs(a.y-d.y)-Math.abs(b.y-d.y));
                for(const p of s){if(!wouldCross(p.id,d.id)){p.targets.push(d.id);break;}}
                if(!prev.some(p=>p.targets.includes(d.id))&&s.length)s[0].targets.push(d.id);
            }
        });
    }
    for(let l=0;l<MAP_LAYERS-2;l++){
        const cur=state.nodes.filter(n=>n.layer===l),br=state.nodes.filter(n=>n.layer===l+2);
        cur.forEach(s=>{if(Math.random()<0.20){const c=[...br].sort((a,b)=>Math.abs(a.y-s.y)-Math.abs(b.y-s.y));for(const d of c){if(!s.targets.includes(d.id)&&!wouldCross(s.id,d.id)){s.targets.push(d.id);break;}}}});
    }
    state.currentNodeId=state.nodes[0].id;
    state.reachable=computeReachable(state.currentNodeId);
    renderMap();
}

// ============================================================
// MAP RENDER
// ============================================================
function renderMap(){
    resetPan();
    const wrapper=document.getElementById('map-wrapper'),W=wrapper.clientWidth||580,H=wrapper.clientHeight||400;
    const grid=document.getElementById('node-layer'),svg=document.getElementById('map-connections'),tooltip=document.getElementById('intel-tooltip');
    grid.innerHTML='';svg.innerHTML='';
    svg.setAttribute('width',W);svg.setAttribute('height',H);svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
    const pn=state.nodes.find(n=>n.id===state.currentNodeId);

    state.nodes.forEach(n=>{
        n.targets.forEach(tid=>{
            const t=state.nodes.find(x=>x.id===tid);if(!t)return;
            const isBr=Math.abs(n.layer-t.layer)>1,isAct=n.id===state.currentNodeId,isOn=state.reachable.has(n.id)&&state.reachable.has(tid);
            const line=document.createElementNS('http://www.w3.org/2000/svg','line');
            line.setAttribute('x1',n.x);line.setAttribute('y1',n.y);line.setAttribute('x2',t.x);line.setAttribute('y2',t.y);
            let cls='map-line';if(isAct)cls+=' active-path';else if(isOn)cls+=' reachable-path';else cls+=' dead-path';
            line.setAttribute('class',cls);svg.appendChild(line);
            if(isBr){const ov=document.createElementNS('http://www.w3.org/2000/svg','line');ov.setAttribute('x1',n.x);ov.setAttribute('y1',n.y);ov.setAttribute('x2',t.x);ov.setAttribute('y2',t.y);ov.setAttribute('class','map-line bridge-overlay');svg.appendChild(ov);}
        });
    });

    state.nodes.forEach(n=>{
        const ntype=NODE_TYPES[n.nodeType];
        const div=document.createElement('div');
        div.className='node';div.style.left=`${n.x}px`;div.style.top=`${n.y}px`;
        const isTgt=pn.targets.includes(n.id),isBehind=n.layer<pn.layer,isReach=state.reachable.has(n.id);
        if(n.cleared){div.classList.add('completed');}
        else if(n.id===state.currentNodeId){div.classList.add('current');}
        else if(isTgt){
            div.classList.add('available');
            if(ntype&&ntype.isBoss)div.classList.add('node-boss');
            attachDragBehaviour(div,{
                onClick(){if(isMapLocked()){shakeWindow('win-map');return;}startBreach(n);},
                onDragStart(){document.getElementById('map-wrapper').classList.add('panning');},
                onDrag(dx,dy){panX+=dx;panY+=dy;applyPan();},
                onDragEnd(){document.getElementById('map-wrapper').classList.remove('panning');},
            });
            div.addEventListener('mouseenter',e=>{
                tooltip.classList.remove('hidden');tooltip.style.left=`${e.clientX+12}px`;tooltip.style.top=`${e.clientY+12}px`;
                const wk=n.weaknessRevealed&&ntype?ntype.weakness.join(', '):'???';
                tooltip.innerHTML=`<strong>${ntype?ntype.icon:''} ${ntype?ntype.label:n.id}</strong><br>FWALL: ${n.hp}/${ntype?ntype.maxHp:'?'}<br>WEAK: ${wk}${ntype&&ntype.isBoss?'<br><span style="color:var(--pink)">⚠ FINAL TARGET</span>':''}`;
            });
            div.addEventListener('mouseleave',()=>tooltip.classList.add('hidden'));
        }else if(isBehind){div.classList.add('completed');}
        else if(!isReach){div.classList.add('unreachable');}
        grid.appendChild(div);
    });
}

// ============================================================
// CLOCK
// ============================================================
function updateClock(){document.getElementById('os-clock').textContent=new Date().toLocaleTimeString('en-US',{hour12:false});}
updateClock();setInterval(updateClock,1000);

// ============================================================
// INIT
// ============================================================
initWindows();
initMapPan();
generateWebMap();
updateGlobalUI();

window.addEventListener('resize',()=>{
    const wa=workArea();
    document.querySelectorAll('.window:not(.hidden):not(.minimised)').forEach(win=>{
        const id=win.id;
        if(winState[id]&&winState[id].maximised){maximiseWindow(id);}
        else if(winState[id]&&winState[id].relX!==null){
            let l=wa.left+winState[id].relX*wa.width,t=wa.top+winState[id].relY*wa.height;
            l=Math.max(wa.left-win.offsetWidth+60,Math.min(wa.left+wa.width-60,l));
            t=Math.max(wa.top,Math.min(wa.top+wa.height-40,t));
            win.style.left=Math.round(l)+'px';win.style.top=Math.round(t)+'px';
        }
    });
    // Don't rescale map here — ResizeObserver below handles it with accurate post-layout dimensions
});

// ResizeObserver fires after layout settles, giving accurate clientWidth/Height.
// This fixes the line-detachment bug that occurred when node coords were computed
// before the wrapper had its final post-resize dimensions.
if (typeof ResizeObserver !== 'undefined') {
    const mapResizeObs = new ResizeObserver(() => {
        // Only rescale if map is visible
        const mw = document.getElementById('map-wrapper');
        if (mw && mw.clientWidth > 0) rescaleMapToWrapper();
    });
    const mw = document.getElementById('map-wrapper');
    if (mw) mapResizeObs.observe(mw);
} else {
    // Fallback for browsers without ResizeObserver
    window.addEventListener('resize', () => rescaleMapToWrapper());
}


// ============================================================
// SYSTEM NAME  (persists independently of run saves)
// ============================================================
const SYSNAME_KEY    = 'abyssal_os_sysname';
const SYSNAME_DEFAULT = 'SYS_ABYSSAL';
const SYSNAME_MAX_LEN = 12;
// Whitelist: uppercase letters, digits, underscore, hyphen only
const SYSNAME_RE      = /[^A-Z0-9_\-]/g;

function sanitiseSysName(raw) {
    return raw.toUpperCase().replace(SYSNAME_RE, '').slice(0, SYSNAME_MAX_LEN) || SYSNAME_DEFAULT;
}

function getSysName() {
    return localStorage.getItem(SYSNAME_KEY) || SYSNAME_DEFAULT;
}

function setSysName(raw) {
    const name = sanitiseSysName(raw);
    localStorage.setItem(SYSNAME_KEY, name);
    // Update every element that shows the system name
    document.querySelectorAll('.sys-name-label').forEach(el => { el.textContent = name; });
    // Also update terminal host label if present
    const hl = document.getElementById('terminal-host-label');
    if (hl) hl.textContent = name;
    return name;
}

// ============================================================
// TERMINAL
// ============================================================
let terminalReady  = false;
let terminalTyping = false;   // true while a typewriter animation is running

const TERM_BOOT_LINES = [
    { text: 'ABYSSAL OS // KERNEL_v0.7', cls: 't-info' },
    { text: `System: ${getSysName()}`, cls: 't-dim', id: 'boot-sysname' },
    { text: 'Type a command below.', cls: 't-dim' },
    { text: '', cls: 't-blank' },
];

const TERM_COMMANDS = {
    help: {
        label: '> help',
        title: 'List commands',
        run() {
            termPrint('Available commands:', 't-info');
            termPrint('  help      — this list', 't-dim');
            termPrint('  whoami    — current operator profile', 't-dim');
            termPrint('  status    — run statistics', 't-dim');
            termPrint('  sysname   — rename this system', 't-dim');
            termPrint('  clear     — clear terminal', 't-dim');
            termPrint('', 't-blank');
            termShowMainChips();
        }
    },
    whoami: {
        label: '> whoami',
        title: 'Operator profile',
        run() {
            const tier = (TIERS[state.tier] || TIERS[0]);
            termPrint(`Operator tier : ${tier.label}`, 't-info');
            termPrint(`System handle : ${getSysName()}`, 't-info');
            termPrint(`Nodes cleared : ${state.nodesBreached}`, 't-dim');
            termPrint('', 't-blank');
            termShowMainChips();
        }
    },
    status: {
        label: '> status',
        title: 'Run statistics',
        run() {
            if (!state.nodes || !state.nodes.length) {
                termPrint('No active run.', 't-warn');
            } else {
                termPrint(`Trace   : ${state.globalTrace} / ${MAX_TRACE}`, state.globalTrace >= TRACE_WARNING ? 't-error' : 't-info');
                termPrint(`Data    : ${state.runData} GB`, 't-info');
                termPrint(`Stealth : ${state.stealth}`, 't-dim');
                termPrint(`Nodes   : ${state.nodesBreached} breached`, 't-dim');
            }
            termPrint('', 't-blank');
            termShowMainChips();
        }
    },
    sysname: {
        label: '> sysname',
        title: 'Rename system',
        run() {
            termPrint(`Current name: ${getSysName()}`, 't-dim');
            termPrint('Enter a new system identifier.', 't-info');
            termPrint('Allowed: A–Z, 0–9, _ and - · max 12 chars', 't-dim');
            termPrint('', 't-blank');
            termShowNameInput();
        }
    },
    clear: {
        label: '> clear',
        title: 'Clear terminal',
        run() {
            const out = document.getElementById('terminal-output');
            if (out) out.innerHTML = '';
            termShowMainChips();
        }
    },
};

function termPrint(text, cls = 't-info', instant = false) {
    const out = document.getElementById('terminal-output');
    if (!out) return;
    const line = document.createElement('span');
    line.className = `t-line ${cls}`;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
    if (!text || instant) {
        line.textContent = text;
        return;
    }
    // Typewriter
    let i = 0;
    const speed = Math.max(12, Math.floor(220 / text.length));
    terminalTyping = true;
    const tick = setInterval(() => {
        // Use textContent so no HTML injection is possible even in theory
        line.textContent = text.slice(0, ++i);
        out.scrollTop = out.scrollHeight;
        if (i >= text.length) {
            clearInterval(tick);
            terminalTyping = false;
        }
    }, speed);
}

function termShowMainChips() {
    const wrap   = document.getElementById('terminal-chips');
    const nameWrap = document.getElementById('terminal-name-input-wrap');
    if (!wrap) return;
    if (nameWrap) nameWrap.classList.add('hidden');
    wrap.innerHTML = '';
    Object.values(TERM_COMMANDS).forEach(cmd => {
        const btn = document.createElement('button');
        btn.className   = 't-chip' + (cmd.label.includes('sysname') ? ' t-chip-primary' : '');
        btn.textContent = cmd.label;
        btn.title       = cmd.title;
        btn.addEventListener('click', () => {
            if (terminalTyping) return;
            termPrint(cmd.label, 't-cmd', true);
            cmd.run();
        });
        wrap.appendChild(btn);
    });
}

function termShowNameInput() {
    const chips    = document.getElementById('terminal-chips');
    const nameWrap = document.getElementById('terminal-name-input-wrap');
    const input    = document.getElementById('terminal-name-input');
    const confirm  = document.getElementById('terminal-name-confirm');
    const cancel   = document.getElementById('terminal-name-cancel');
    if (!nameWrap || !input) return;

    chips.innerHTML = '';
    nameWrap.classList.remove('hidden');
    input.value = '';
    input.focus();

    // Strip disallowed chars on every keystroke — user can never type anything invalid
    input.oninput = () => {
        const cleaned = sanitiseSysName(input.value);
        // Preserve cursor: only rewrite if content actually changed
        if (input.value.toUpperCase().replace(SYSNAME_RE, '').slice(0, SYSNAME_MAX_LEN) !== input.value) {
            input.value = cleaned;
        }
    };

    confirm.onclick = () => {
        const name = sanitiseSysName(input.value);
        if (!name || name === SYSNAME_DEFAULT && !input.value) {
            termPrint('Name unchanged.', 't-warn', true);
        } else {
            setSysName(name);
            termPrint(`System renamed: ${name}`, 't-success', true);
        }
        termPrint('', 't-blank', true);
        nameWrap.classList.add('hidden');
        termShowMainChips();
    };

    cancel.onclick = () => {
        termPrint('Rename cancelled.', 't-dim', true);
        termPrint('', 't-blank', true);
        nameWrap.classList.add('hidden');
        termShowMainChips();
    };

    // Enter key on input
    input.onkeydown = (e) => {
        if (e.key === 'Enter') confirm.onclick();
        if (e.key === 'Escape') cancel.onclick();
    };
}

function openTerminal() {
    openWindow('win-terminal');
    if (!terminalReady) {
        terminalReady = true;
        // Boot sequence printed instantly so window feels snappy on first open
        TERM_BOOT_LINES.forEach(l => termPrint(l.text, l.cls, true));
    }
    termShowMainChips();
}

// ============================================================
// SAVE / LOAD  (localStorage)
// ============================================================
const SAVE_KEY = 'abyssal_os_save';

function serializeState() {
    // Only save things that can be JSON-serialised and are meaningful across sessions.
    // 'reachable' is a Set — recompute from currentNodeId on load.
    // Node targets array IS serialisable so the full graph is preserved.
    return JSON.stringify({
        currentNodeId:     state.currentNodeId,
        targetId:          state.targetId,
        nodes:             state.nodes.map(n => ({
            id: n.id, layer: n.layer, x: n.x, y: n.y,
            hp: n.hp, nodeType: n.nodeType, targets: n.targets,
            cleared: n.cleared, weaknessRevealed: n.weaknessRevealed,
        })),
        globalTrace:       state.globalTrace,
        runData:           state.runData,
        stealth:           state.stealth,
        tier:              state.tier,
        nodesBreached:     state.nodesBreached,
        upgrades:          state.upgrades,
        persistentEffects: state.persistentEffects,
        deck:              state.deck,
        upgradeOpen:       false,   // never save mid-upgrade open state
        breachActive:      false,   // never save mid-breach
    });
}

function saveRun() {
    try {
        localStorage.setItem(SAVE_KEY, serializeState());
        showPowerToast('RUN SAVED');
    } catch(e) {
        showPowerToast('SAVE FAILED');
    }
}

function loadRun() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) { showPowerToast('NO SAVE FOUND'); return; }
        const saved = JSON.parse(raw);
        // Restore state fields
        Object.assign(state, saved);
        // Recompute non-serialisable fields
        state.reachable        = computeReachable(state.currentNodeId);
        state.breachActive     = false;
        state.upgradeOpen      = false;
        state.hand             = [];
        state.drawPile         = [];
        state.discardPile      = [];
        state.turnEffects      = {};
        state.cardsPlayedThisTurn = [];
        state.firstToolPlayedThisBreach = true;
        state.toolsUsedThisBreach = [];
        state.activeSynergies  = [];

        updateGlobalUI();
        renderMap();
        showPowerToast('RUN LOADED');
    } catch(e) {
        showPowerToast('LOAD FAILED');
        console.error(e);
    }
}

function hasSave() {
    return !!localStorage.getItem(SAVE_KEY);
}

function deleteSave() {
    localStorage.removeItem(SAVE_KEY);
}

// ============================================================
// POWER MENU (top-right dropdown)
// ============================================================
let powerMenuOpen = false;

function togglePowerMenu() {
    const menu = document.getElementById('power-menu');
    powerMenuOpen = !powerMenuOpen;
    menu.classList.toggle('hidden', !powerMenuOpen);
    // Update load button state
    document.getElementById('pm-load').disabled = !hasSave();
}

function closePowerMenu() {
    const menu = document.getElementById('power-menu');
    if (menu) menu.classList.add('hidden');
    powerMenuOpen = false;
}

function powerSave() {
    saveRun(); closePowerMenu();
}

function powerLoad() {
    if (!hasSave()) { showPowerToast('NO SAVE FOUND'); closePowerMenu(); return; }
    // Close any open windows first
    ['win-breach','win-upgrade','win-endscreen'].forEach(id => {
        const w = document.getElementById(id);
        if (w && !w.classList.contains('hidden')) {
            w.classList.add('hidden');
            const t = getTab(id); if (t) t.remove();
        }
    });
    loadRun();
    closePowerMenu();
}

function powerReset() {
    closePowerMenu();
    document.getElementById('win-reset-confirm').classList.remove('hidden');
}

function powerResetConfirm() {
    document.getElementById('win-reset-confirm').classList.add('hidden');
    deleteSave();
    startNewRun();
}

function powerResetCancel() {
    document.getElementById('win-reset-confirm').classList.add('hidden');
}

function showPowerToast(msg) {
    const el = document.createElement('div');
    el.className = 'power-toast';
    el.textContent = msg;
    document.getElementById('desktop').appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2000);
}

// Close power menu when clicking outside
document.addEventListener('click', e => {
    if (!e.target.closest('#power-btn-wrap')) closePowerMenu();
});


// ============================================================
// OPSEC CONSOLE — Go Dark, Log Wipe, Pivot
// ============================================================

function openOpsecConsole() {
    if (state.breachActive) { shakeWindow('win-breach'); return; }
    if (state.upgradeOpen)  { shakeWindow('win-upgrade'); return; }
    buildOpsecWindow();
    openWindow('win-opsec');
}

function closeOpsecConsole() {
    const win = document.getElementById('win-opsec');
    if (win) win.classList.add('hidden');
    const tab = getTab('win-opsec');
    if (tab) tab.remove();
    // Cancel any running mini-game
    stopLogWipeGame();
}

function buildOpsecWindow() {
    const el = id => document.getElementById(id);
    if (!el('win-opsec')) return;

    // Clear any stale result text from a previous run or previous use
    ['opsec-gd-result', 'opsec-lw-result', 'opsec-pv-result'].forEach(rid => {
        const r = el(rid);
        if (r) { r.textContent = ''; r.style.color = ''; }
    });

    // Reset log wipe UI back to the start-button state
    const lwGame  = el('opsec-lw-game');
    const lwSetup = el('opsec-lw-setup');
    if (lwGame)  lwGame.style.display  = 'none';
    if (lwSetup) lwSetup.style.display = 'block';

    const gdCharges = state.opsecCharges.goDark;
    if (el('opsec-gd-charges')) el('opsec-gd-charges').textContent = gdCharges;
    if (el('btn-go-dark'))      el('btn-go-dark').disabled = gdCharges <= 0;

    const lwCharges = state.opsecCharges.logWipe;
    if (el('opsec-lw-charges')) el('opsec-lw-charges').textContent = lwCharges;
    if (el('btn-log-wipe'))     el('btn-log-wipe').disabled = lwCharges <= 0;

    const pvCharges = state.opsecCharges.pivot;
    const pivotCost = 10;
    if (el('opsec-pv-charges')) el('opsec-pv-charges').textContent = pvCharges;
    if (el('opsec-pv-cost'))    el('opsec-pv-cost').textContent = pivotCost;
    if (el('btn-pivot'))        el('btn-pivot').disabled = pvCharges <= 0 || state.runData < pivotCost;

    updateOpsecStatus();
}

function updateOpsecStatus() {
    const el = id => document.getElementById(id);
    if (el('opsec-trace-display')) {
        el('opsec-trace-display').textContent = `${state.globalTrace}/${MAX_TRACE}`;
        el('opsec-trace-display').style.color = state.globalTrace >= TRACE_WARNING ? '#ff3a3a' : 'var(--cyan)';
    }
    if (el('opsec-data-display')) {
        el('opsec-data-display').textContent = state.runData;
    }
}

// ── GO DARK ──────────────────────────────────────────────────
// Disconnect for one "day". Trace -3, but target node HP +10%
// and weakness intel decays (re-hides if not yet breached).
function goDark() {
    if (state.opsecCharges.goDark <= 0) return;
    state.opsecCharges.goDark--;

    const traceReduction = 3;
    state.globalTrace = Math.max(0, state.globalTrace - traceReduction);

    // Target nodes slightly recover — going offline gives them time to patch
    state.nodes.forEach(n => {
        if (!n.cleared) {
            const ndata = NODE_TYPES[n.nodeType];
            const cap = ndata ? ndata.maxHp : 99;
            n.hp = Math.min(cap, Math.floor(n.hp * 1.1 + 1));
            // Stealth intel decays — revealed weaknesses hide again (50% chance per node)
            if (n.weaknessRevealed && Math.random() < 0.5) {
                n.weaknessRevealed = false;
            }
        }
    });

    showFloatingText(`WENT DARK  -${traceReduction} TRACE`, 'data');
    updateGlobalUI();
    buildOpsecWindow();
    renderMap();

    // Animate the "going dark" status
    const statusEl = document.getElementById('opsec-gd-result');
    if (statusEl) {
        statusEl.textContent = `OFFLINE 24h — trace -${traceReduction}, nodes hardened`;
        statusEl.style.color = '#7fff7f';
    }
}

// ── LOG WIPE MINI-GAME ────────────────────────────────────────
// A scrolling log panel shows 8 entries. 4 are YOUR breach logs
// (marked with your session ID). Click them within the time limit.
// Hit all 4: -5 trace. Miss some: -2 trace + 1 trace per miss.
// Click a clean log (false positive): +1 trace.

let logWipeTimer   = null;
let logWipeTimeout = null;
let logWipeTargets = new Set();
let logWipeCleared = new Set();
let logWipeFalseHits = 0;
const LOG_WIPE_TIME   = 10000; // ms
const LOG_WIPE_TARGET_COUNT = 4;

const LOG_TEMPLATES = [
    'sshd: Accepted publickey for root from {ip} port {port}',
    'sudo: {user} : TTY=pts/0 ; PWD=/root ; USER=root ; COMMAND=/bin/bash',
    'kernel: TCP: {ip}:{port} -> 10.0.0.1:22',
    'nginx: {ip} - - [{ts}] "GET /admin HTTP/1.1" 200',
    'pam_unix: session opened for user root by (uid=0)',
    'auditd: type=EXECVE msg=audit({ts}): argc=2 a0="wget" a1="http://{ip}/shell.sh"',
    'syslog: CRON[{port}]: ({user}) CMD (/usr/bin/curl {ip}/beacon)',
    'auth: Invalid user admin from {ip} port {port}',
    'kernel: device eth0 entered promiscuous mode',
    'rsyslog: action \'action-1-...\' suspended, next retry in 10 seconds',
    'systemd: Started Session {port} of user {user}',
    'sshd: Failed password for invalid user from {ip}',
];
const CLEAN_TEMPLATES = [
    'systemd: Starting Daily apt download activities...',
    'cron: (root) CMD (   [ -x /usr/lib/php/sessionclean ] && if [ ! -d /run/systemd/system ]; then /usr/lib/php/sessionclean; fi)',
    'kernel: EXT4-fs (sda1): re-mounted. Opts: errors=remount-ro',
    'NetworkManager: <info> [dhcp4] state changed new lease',
    'rsyslogd: [origin software="rsyslogd"] start',
    'systemd-logind: New seat seat0.',
    'snapd: cannot create sockets dir',
];

function randomIp()   { return `${rnd(10,254)}.${rnd(0,255)}.${rnd(0,255)}.${rnd(1,254)}`; }
function randomPort() { return rnd(40000,65535); }
function randomUser() { return ['root','ubuntu','admin','www-data'][rnd(0,3)]; }
function randomTs()   { const d=new Date(); return d.toISOString().slice(0,19).replace('T',' '); }
function rnd(a,b)     { return Math.floor(Math.random()*(b-a+1))+a; }

function fillTemplate(tmpl) {
    return tmpl
        .replace(/{ip}/g, randomIp())
        .replace(/{port}/g, randomPort())
        .replace(/{user}/g, randomUser())
        .replace(/{ts}/g, randomTs());
}

function stopLogWipeGame() {
    if (logWipeTimer)   { clearInterval(logWipeTimer); logWipeTimer = null; }
    if (logWipeTimeout) { clearTimeout(logWipeTimeout); logWipeTimeout = null; }
    logWipeTargets.clear();
    logWipeCleared.clear();
    logWipeFalseHits = 0;
}

function startLogWipe() {
    if (state.opsecCharges.logWipe <= 0) return;
    state.opsecCharges.logWipe--;
    stopLogWipeGame();

    logWipeTargets.clear();
    logWipeCleared.clear();
    logWipeFalseHits = 0;

    const container = document.getElementById('log-wipe-entries');
    if (!container) return;
    container.innerHTML = '';

    // Build 8 log entries: 4 breach logs (targets), 4 clean logs
    const sessionId = `SID-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const allEntries = [];

    // Breach logs — tagged with session marker
    const breachTemplates = shuffle([...LOG_TEMPLATES]).slice(0, LOG_WIPE_TARGET_COUNT);
    breachTemplates.forEach((tmpl, i) => {
        const id = `log-${i}`;
        logWipeTargets.add(id);
        allEntries.push({ id, text: fillTemplate(tmpl), isTarget: true, sessionId });
    });

    // Clean logs — should not be clicked
    const cleanTemplates = shuffle([...CLEAN_TEMPLATES]).slice(0, 4);
    cleanTemplates.forEach((tmpl, i) => {
        allEntries.push({ id: `clean-${i}`, text: fillTemplate(tmpl), isTarget: false });
    });

    shuffle(allEntries).forEach(entry => {
        const row = document.createElement('div');
        row.className = 'log-entry' + (entry.isTarget ? ' log-target' : '');
        row.id = entry.id;

        const ts  = document.createElement('span');
        ts.className = 'log-ts';
        ts.textContent = randomTs();

        const txt = document.createElement('span');
        txt.className = 'log-text';
        txt.textContent = entry.isTarget
            ? `[${entry.sessionId}] ${entry.text}`
            : entry.text;

        const btn = document.createElement('button');
        btn.className = 'log-clear-btn';
        btn.textContent = 'CLEAR';
        btn.addEventListener('click', () => onLogEntryClicked(entry, row, btn));

        row.appendChild(ts);
        row.appendChild(txt);
        row.appendChild(btn);
        container.appendChild(row);
    });

    // Show game UI
    document.getElementById('opsec-lw-setup').style.display = 'none';
    document.getElementById('opsec-lw-game').style.display  = 'block';
    document.getElementById('opsec-lw-result').textContent  = '';

    // Timer bar
    const startTime = Date.now();
    const timerBar  = document.getElementById('log-wipe-timer-bar');
    if (timerBar) timerBar.style.width = '100%';

    logWipeTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct     = Math.max(0, 100 - (elapsed / LOG_WIPE_TIME) * 100);
        if (timerBar) {
            timerBar.style.width = pct + '%';
            timerBar.style.background = pct < 30 ? 'var(--pink)' : '#27c93f';
        }
    }, 100);

    logWipeTimeout = setTimeout(() => finishLogWipe(), LOG_WIPE_TIME);
}

function onLogEntryClicked(entry, row, btn) {
    if (row.classList.contains('log-cleared') || row.classList.contains('log-mistake')) return;
    btn.disabled = true;

    if (entry.isTarget) {
        logWipeCleared.add(entry.id);
        row.classList.add('log-cleared');
        // Auto-finish if all targets cleared
        if (logWipeCleared.size >= logWipeTargets.size) {
            setTimeout(() => finishLogWipe(), 300);
        }
    } else {
        // False positive — clicked a clean log
        logWipeFalseHits++;
        row.classList.add('log-mistake');
        showFloatingText('+1 TRACE (FALSE POSITIVE)', 'trace');
        state.globalTrace = Math.min(MAX_TRACE, state.globalTrace + 1);
        updateGlobalUI();
    }
}

function finishLogWipe() {
    stopLogWipeGame();

    const hit    = logWipeCleared.size;
    const missed = logWipeTargets.size - hit;
    let traceChange = 0;

    if (missed === 0) {
        // Perfect wipe
        traceChange = -5;
        showFloatingText('CLEAN WIPE  -5 TRACE', 'data');
    } else {
        // Partial wipe — analysts noticed
        traceChange = -2 + missed; // e.g. 2 missed = -2 + 2 = 0 net
        showFloatingText(`PARTIAL WIPE  ${traceChange > 0 ? '+' : ''}${traceChange} TRACE`, 'trace');
    }

    state.globalTrace = Math.max(0, Math.min(MAX_TRACE, state.globalTrace + traceChange));
    updateGlobalUI();
    updateOpsecStatus();

    const resultEl = document.getElementById('opsec-lw-result');
    if (resultEl) {
        const color = traceChange < 0 ? '#7fff7f' : traceChange === 0 ? '#f5a623' : 'var(--pink)';
        resultEl.style.color = color;
        resultEl.textContent = missed === 0
            ? `PERFECT — all ${hit} breach logs wiped. Trace -5.`
            : `${hit}/${logWipeTargets.size} cleared, ${missed} missed. ${logWipeFalseHits} false positives. Net: ${traceChange > 0 ? '+' : ''}${traceChange} trace.`;
    }

    // Offer replay
    document.getElementById('opsec-lw-game').style.display  = 'none';
    document.getElementById('opsec-lw-setup').style.display = 'block';
    buildOpsecWindow(); // refresh charges display
}

// ── PIVOT ─────────────────────────────────────────────────────
// Spend 10 data to route through a clean hop.
// For the NEXT breach: all trace costs reduced by 1, and
// ICE retaliation is halved.
function pivot() {
    const cost = 10;
    if (state.opsecCharges.pivot <= 0 || state.runData < cost) return;
    state.opsecCharges.pivot--;
    state.runData -= cost;
    state.persistentEffects.pivotActive = true;

    showFloatingText(`PIVOT ACTIVE — next breach: -1 trace/card, half ICE`, 'data');
    updateGlobalUI();
    buildOpsecWindow();

    const resultEl = document.getElementById('opsec-pv-result');
    if (resultEl) {
        resultEl.textContent = 'PIVOT ROUTE ACTIVE — applies to next breach';
        resultEl.style.color = '#7fff7f';
    }
}

// Apply pivot effect at start of breach (one-time)
function consumePivotIfActive() {
    if (state.persistentEffects.pivotActive) {
        state.persistentEffects.pivotActive = false;
        state.persistentEffects.traceCostReduction = (state.persistentEffects.traceCostReduction || 0) + 1;
        state.persistentEffects.halfIceThisBreach  = true;
        showFloatingText('PIVOT ACTIVE: -1 trace/card, ½ ICE', 'data');
    }
}

    // ============================================================
    // EXPOSE GLOBALS  (needed for inline onclick in HTML)
    // ============================================================
    window.endTurn                 = endTurn;
    window.skipPhase               = skipPhase;
    window.retreat                 = retreat;
    window.useBurner               = useBurner;
    window.closeUpgradeAndContinue = closeUpgradeAndContinue;
    window.startNewRun             = startNewRun;
    window.togglePowerMenu         = togglePowerMenu;
    window.openOpsecConsole        = openOpsecConsole;
    window.closeOpsecConsole       = closeOpsecConsole;
    window.goDark                  = goDark;
    window.startLogWipe            = startLogWipe;
    window.pivot                   = pivot;
    window.powerSave               = powerSave;
    window.powerLoad               = powerLoad;
    window.powerReset              = powerReset;
    window.powerResetConfirm       = powerResetConfirm;
    window.powerResetCancel        = powerResetCancel;
    window.openTerminal            = openTerminal;

    // Apply persisted system name on boot
    setSysName(getSysName());

}); // end DOMContentLoaded
