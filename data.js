// ============================================================
//  HACKNODE — Data  v3.1  (unchanged game logic)
// ============================================================

const RARITY = {
  COMMON:    { id:0, label:'COMMON',    color:'#4af0ff', glow:'rgba(74,240,255,0.45)'  },
  UNCOMMON:  { id:1, label:'UNCOMMON',  color:'#00ff9d', glow:'rgba(0,255,157,0.45)'   },
  RARE:      { id:2, label:'RARE',      color:'#c060ff', glow:'rgba(192,96,255,0.5)'   },
  LEGENDARY: { id:3, label:'LEGENDARY', color:'#ffd700', glow:'rgba(255,215,0,0.65)'   },
};

const TIERS = {
  SCRIPT_KIDDIE: { id:0, label:'Script',  color:'#7fffb8' },
  GRAY_HAT:      { id:1, label:'Gray',    color:'#7fb8ff' },
  BLACK_HAT:     { id:2, label:'Black',   color:'#c87fff' },
  GHOST:         { id:3, label:'Ghost',   color:'#ff7fb8' },
};

const TOOLS = [
  { id:'bit_shift',     name:'Bit-Shift',        rarity:0, tier:0, icon:'⇄',  iconType:'text',
    desc:'Shift security value ±2.',             flavor:'"Flip a bit, flip the game."',
    cost:0, power:6,  tags:['utility','shift'],
    effect(c){c.dealDamage(6);}},

  { id:'brute_force',   name:'Brute Force',       rarity:0, tier:0, icon:'🔨', iconType:'emoji',
    desc:'+5 DMG for every consecutive use.',    flavor:'"14 million attempts/sec."',
    cost:1, power:4,  tags:['brute','scaling'],
    effect(c){const s=(c.getState('bruteStack')||0);c.dealDamage(4+s*5);c.setState('bruteStack',s+1);}},

  { id:'packet_sniffer',name:'Packet Sniffer',    rarity:0, tier:0, icon:'🦈', iconType:'emoji',
    desc:'Reveals weaknesses. +4 data.',         flavor:'"tcpdump -i eth0 -w capture.pcap"',
    cost:1, power:4,  tags:['recon','scan','logic'],
    effect(c){c.dealDamage(4);c.gainData(4);c.revealWeakness();}},

  { id:'default_creds', name:'Default Creds',     rarity:0, tier:0, icon:'🔑', iconType:'emoji',
    desc:'Try admin/admin.',                     flavor:'"password: password"',
    cost:0, power:5,  tags:['social','login'],
    effect(c){c.dealDamage(5);}},

  { id:'phishing_link', name:'Phishing Link',     rarity:0, tier:0, icon:'🎣', iconType:'emoji',
    desc:'Low trace, +1 data.',                  flavor:'"Click here to verify your account."',
    cost:0, power:4,  tags:['social','distract'],
    effect(c){c.dealDamage(4);c.gainData(1);}},

  { id:'port_scan',     name:'Port Scan',         rarity:0, tier:0, icon:'📡', iconType:'emoji',
    desc:'3 dmg, reveals weakness.',             flavor:'"nmap -sV -sC --script vuln"',
    cost:1, power:3,  tags:['recon','scan','logic'],
    effect(c){c.dealDamage(3);c.revealWeakness();}},

  { id:'logic_bomb',    name:'Logic Bomb',        rarity:1, tier:1, icon:'💣', iconType:'emoji',
    desc:'50 dmg. On kill: splash 25 to all.',   flavor:'"Set the timer. Walk away."',
    cost:2, power:50, tags:['exploit','aoe','logic'],
    effect(c){c.dealDamage(50);if(c.getState('nodeHp')<=0)c.damageAllNodes(25);}},

  { id:'rootkit',       name:'Rootkit',           rarity:1, tier:1, icon:'🌱', iconType:'emoji',
    desc:'−20% trace gain this node.',           flavor:'"chmod 777 /etc/shadow"',
    cost:2, power:8,  tags:['persist','stealth'],
    effect(c){c.dealDamage(8);c.addPersistentEffect('traceReduction',0.2);}},

  { id:'sql_injector',  name:'SQL Injector',      rarity:1, tier:1, icon:'💉', iconType:'emoji',
    desc:'70 dmg, +2 data, +8 trace.',           flavor:"\"Robert'); DROP TABLE students;--\"",
    cost:3, power:70, tags:['exploit','web','login'],
    effect(c){c.dealDamage(70);c.gainData(2);c.addTrace(8);}},

  { id:'encrypted_tunnel',name:'Enc. Tunnel',     rarity:1, tier:1, icon:'🔗', iconType:'emoji',
    desc:'Freeze trace for 2 turns.',            flavor:'"AES-256. Good luck."',
    cost:2, power:0,  tags:['stealth','network'],
    effect(c){c.addTurnEffect('halfTrace',true);c.addStealth(3);}},

  { id:'arp_spoof',     name:'ARP Spoof',         rarity:1, tier:1, icon:'🌐', iconType:'emoji',
    desc:'6 dmg, +3 data, +1 trace.',            flavor:'"Who has 192.168.1.1? I do."',
    cost:2, power:6,  tags:['mitm','network'],
    effect(c){c.dealDamage(6);c.gainData(3);c.addTrace(1);}},

  { id:'overclock',     name:'Overclock',         rarity:2, tier:2, icon:'⚡', iconType:'text',
    desc:'Next tool triggers TWICE.',            flavor:'"Push it past the limit."',
    cost:3, power:0,  tags:['exploit','escalate','logic'],
    effect(c){c.addTurnEffect('doubleTrigger',true);c.addTrace(2);}},

  { id:'heuristic_scanner',name:'Heuristic Scan', rarity:2, tier:2, icon:'🔬', iconType:'emoji',
    desc:'+35% crit chance on Logic tools.',     flavor:'"Behavioral analysis."',
    cost:2, power:5,  tags:['recon','logic','scan'],
    effect(c){c.dealDamage(5);c.addPersistentEffect('logicCritBonus',0.35);}},

  { id:'kernel_exploit',name:'Kernel Exploit',    rarity:2, tier:2, icon:'⚙️', iconType:'emoji',
    desc:'Root escalation. Next tool ×2 DMG.',   flavor:'"dirty pipe, dirty cow"',
    cost:3, power:8,  tags:['exploit','escalate'],
    effect(c){c.dealDamage(8);c.addTurnEffect('doubleDamage',true);}},

  { id:'memory_scrape', name:'Memory Scrape',     rarity:2, tier:2, icon:'🧠', iconType:'emoji',
    desc:'8 dmg, +12 data.',                     flavor:'"cleartext everywhere."',
    cost:3, power:8,  tags:['exploit','recon'],
    effect(c){c.dealDamage(8);c.gainData(12);}},

  { id:'zero_day',      name:'Zero-Day',          rarity:3, tier:3, icon:'💀', iconType:'emoji',
    desc:'120 dmg. ONCE PER RUN.',               flavor:'"$250k on the dark web."',
    cost:4, power:120,tags:['exploit','zero-day'],
    effect(c){if(c.getState('zeroDayUsed')){c.showMessage('Zero-Day already used!');return;}
              c.dealDamage(120);c.setState('zeroDayUsed',true);c.addTrace(2);}},

  { id:'apt_implant',   name:'APT Implant',       rarity:3, tier:3, icon:'👻', iconType:'emoji',
    desc:'20 dmg, zero trace.',                  flavor:'"Attributed to no one."',
    cost:4, power:20, tags:['exploit','stealth','persist'],
    effect(c){c.dealDamage(20);}},

  { id:'supply_chain',  name:'Supply Chain',      rarity:3, tier:3, icon:'🏭', iconType:'emoji',
    desc:'10 dmg + 5 dmg ALL nodes.',            flavor:'"SolarWinds. XZ utils."',
    cost:5, power:10, tags:['network','stealth','persist'],
    effect(c){c.dealDamage(10);c.damageAllNodes(5);}},
];

const SYNERGIES = [
  { ids:['overclock','zero_day'],      name:'BOSS KILLER',     tier:'S', color:'#ffd700',
    desc:'200 DMG burst, no trace',
    bonusEffect(c){c.dealDamage(200);c.addTurnEffect('noTrace',true);}},
  { ids:['logic_bomb','bit_shift'],    name:'CHAIN REACTION',  tier:'A', color:'#ff6b35',
    desc:'Splash damage ×2',
    bonusEffect(c){c.damageAllNodes(25);}},
  { ids:['brute_force','rootkit'],     name:'SLOW BURN',       tier:'A', color:'#00ff9d',
    desc:'+3 brute stack, trace locked',
    bonusEffect(c){c.setState('bruteStack',(c.getState('bruteStack')||0)+3);c.addTurnEffect('noTrace',true);}},
  { ids:['packet_sniffer','sql_injector'],name:'PRECISION STRIKE',tier:'A',color:'#c060ff',
    desc:'+20 DMG, reveal all weaknesses',
    bonusEffect(c){c.dealDamage(20);c.revealWeakness();}},
  { ids:['heuristic_scanner','logic_bomb'],name:'CRIT BOMB',   tier:'S', color:'#ff3a5a',
    desc:'Logic Bomb crits — ×3 damage',
    bonusEffect(c){c.dealDamage(100);c.damageAllNodes(25);}},
  { ids:['overclock','kernel_exploit'],name:'ROOT OVERDRIVE',  tier:'A', color:'#c87fff',
    desc:'Triple damage on next card',
    bonusEffect(c){c.addTurnEffect('tripleDamage',true);}},
  { ids:['encrypted_tunnel','apt_implant'],name:'GHOST PROTOCOL',tier:'S',color:'#ffd700',
    desc:'Zero trace this node, +15 DMG',
    bonusEffect(c){c.addTurnEffect('noTrace',true);c.dealDamage(15);}},
  { ids:['port_scan','logic_bomb'],    name:'SURGICAL STRIKE', tier:'B', color:'#4af0ff',
    desc:'+15 DMG with weakness bonus',
    bonusEffect(c){c.dealDamage(15);}},
];

const NODE_TYPES = [
  { id:'workstation',  label:'Workstation', sublabel:'SEC: LOW',     icon:'💻', color:'#4af0ff', maxHp:120, reward:{data:4,  tools:1}, weakness:['social','login'],         flavor:'Greg from accounting. IE11.' },
  { id:'web_server',   label:'Web Server',  sublabel:'SEC: MEDIUM',  icon:'🌐', color:'#00ffc8', maxHp:200, reward:{data:7,  tools:1}, weakness:['web','exploit'],          flavor:'Apache 2.2.22. CVEs: many.' },
  { id:'database',     label:'Database',    sublabel:'SEC: HIGH',    icon:'🗄️', color:'#ff9f3a', maxHp:280, reward:{data:15, tools:0}, weakness:['web','exploit','scan'],   flavor:'Postgres. Unencrypted PII.' },
  { id:'firewall',     label:'Firewall',    sublabel:'SEC: EXTREME', icon:'🔥', color:'#ff3a5a', maxHp:380, reward:{data:5,  tools:2}, weakness:['network','zero-day'],     flavor:'Cisco ASA. Mis-configured.' },
  { id:'mail_server',  label:'Mail Server', sublabel:'SEC: MEDIUM',  icon:'📧', color:'#c060ff', maxHp:180, reward:{data:10, tools:1}, weakness:['social','login','exploit'],flavor:'Exchange 2010. OWA enabled.' },
  { id:'iot_device',   label:'IoT Device',  sublabel:'SEC: MINIMAL', icon:'📷', color:'#7fff7f', maxHp:80,  reward:{data:3,  tools:0}, weakness:['brute','login','scan'],   flavor:'Smart fridge. Password: admin.' },
  { id:'admin_term',   label:'Admin Term',  sublabel:'SEC: HIGH',    icon:'🖥️', color:'#ffe44d', maxHp:300, reward:{data:8,  tools:2}, weakness:['exploit','mitm','social'],flavor:'Root access. The real prize.' },
  { id:'crown_jewel',  label:'Mainframe',   sublabel:'PRIMARY TARGET',icon:'👑',color:'#ff4fa0', maxHp:500, reward:{data:30, tools:3}, weakness:[],                         flavor:"The reason you're here.", isBoss:true },
];

const UPGRADES = [
  { id:'dark_vpn',        name:'Dark VPN',        icon:'🌑', desc:'All trace gains −1 (min 0)',   effect:'globalTraceMinus1' },
  { id:'tor_routing',     name:'Tor Routing',     icon:'🧅', desc:'Start each node with +2 stealth', effect:'startStealth2' },
  { id:'cached_exploit',  name:'Cached Exploit',  icon:'⚡', desc:'First tool each node is free', effect:'firstToolFree' },
  { id:'burner_account',  name:'Burner Account',  icon:'🔥', desc:'Once per run: clear 5 trace',  effect:'burnerClear' },
  { id:'recon_dump',      name:'Recon Dump',      icon:'📦', desc:'Draw 1 extra card per turn',   effect:'drawPlus1' },
  { id:'compiled_tool',   name:'Compiled Tool',   icon:'🔧', desc:'All tools deal +10 damage',    effect:'globalDamagePlus10' },
  { id:'insider_tip',     name:'Insider Tip',     icon:'👁',  desc:'Reveal all weaknesses',        effect:'revealAll' },
  { id:'exploit_db',      name:'ExploitDB Sub',   icon:'💾', desc:'Uncommon tools deal ×2 damage', effect:'uncommonDouble' },
  { id:'zero_day_cache',  name:'0day Cache',      icon:'💀', desc:'Zero-Day usable twice per run', effect:'zeroDayReset' },
  { id:'overclock_mod',   name:'Overclock Mod',   icon:'🔋', desc:'Overclock costs 0 trace',      effect:'overclockFree' },
];

const ORGS = [
  { name:'PHARMA-CORP',     sublabel:'CLASSIFIED DATABASE',    flavor:'Medical records. Dirty secrets.',     traceLimit:20, nodes:6 },
  { name:'NOVABANQUE S.A.', sublabel:'FINANCIAL MAINFRAME',    flavor:'Swiss bank. Old money. Old code.',    traceLimit:15, nodes:5 },
  { name:'HELIX MEDIA',     sublabel:'MEDIA DISTRIBUTION NET', flavor:'They own the narrative. Not anymore.',traceLimit:22, nodes:7 },
  { name:'AXIOM DEFENSE',   sublabel:'CLASSIFIED NETWORK',     flavor:'Defense contractor. Warmongers.',     traceLimit:18, nodes:6 },
  { name:'KRONOS SYSTEMS',  sublabel:'ENTERPRISE CLUSTER',     flavor:'The house always wins. Until now.',   traceLimit:25, nodes:8 },
];

const CONFIG = {
  handSize: 5,
  startingDeckIds:['bit_shift','brute_force','packet_sniffer','default_creds','phishing_link','port_scan'],
  maxTrace: 20,
  traceWarningThreshold: 13,
  nodeCols: 3,
};
