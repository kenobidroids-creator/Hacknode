# ABYSSAL OS — Operator Field Manual
> *"The network is the target. The trace counter is the clock. Everything else is noise."*

---

## Table of Contents

1. [The Core Loop](#1-the-core-loop)
2. [The Interface](#2-the-interface)
3. [The Network Map](#3-the-network-map)
4. [Breaching a Node](#4-breaching-a-node)
5. [Breach Phases](#5-breach-phases)
6. [Your Tools (Card Database)](#6-your-tools-card-database)
7. [Trace & IDS — The Real Enemy](#7-trace--ids--the-real-enemy)
8. [Synergies](#8-synergies)
9. [Node Types & Threat Levels](#9-node-types--threat-levels)
10. [Upgrades](#10-upgrades)
11. [OPSEC Console](#11-opsec-console)
12. [Target Organisations](#12-target-organisations)
13. [Strategies & Build Guides](#13-strategies--build-guides)
14. [Quick Reference](#14-quick-reference)

---

## 1. The Core Loop

Every run follows the same cycle:

```
START RUN → MAP → select node → BREACH → (win/retreat) → UPGRADE → MAP → ...
                                                                          ↓
                                                               reach BOSS → WIN
                                                    OR trace hits max → GAME OVER
```

You are assigned a random target organisation with a fixed number of nodes. Work through the network, breach each node to unlock the next, collect upgrades, and take down the final Mainframe before your trace level gets you killed.

---

## 2. The Interface

The game runs as a simulated operating system. All panels are draggable windows you can minimise, maximise, and close.

| Element | What it shows |
|---|---|
| **Top-left logo** | Your system handle (rename via Terminal) |
| **OPSEC ▼** | Opens the OPSEC Console (trace management) |
| **TRACE X/Y** | Your global trace level vs. the run's maximum |
| **DATA** | Total data exfiltrated this run |
| **NODES** | Number of nodes successfully breached |
| **Tier label** | Your current operator tier — set by the highest-tier tool you've played |
| **Clock** | Session timer |
| **PWR** | Save, load, or reset the current run |
| **TERMINAL** | In-game terminal for system commands |
| **Taskbar** | Minimised windows live here; click to restore |

---

## 3. The Network Map

`NETWORK_TOPOLOGY.exe` shows every node in the target organisation.

- **Your position** is highlighted — this is where you currently are in the network.
- **Reachable nodes** (not locked) are the only ones you can attack next.
- **Locked nodes** are greyed out. Clear the node ahead of them first.
- **Cleared nodes** are marked as breached.
- **Boss node** (👑 Mainframe) is always last. It cannot be accessed until every path leading to it is cleared.

> **Tip:** Some nodes have weaknesses pre-revealed. Targeting those first gives you a damage bonus the moment you start attacking them.

---

## 4. Breaching a Node

Click a reachable node on the map to open `BREACH_CONSOLE.bin`.

### What you see

- **Target panel** — node name, security level, and HP bar (labelled FIREWALL).
- **Weakness tags** — shown as `???` until revealed. Matching tool tags deal **×1.5 damage**.
- **Your hand** — 5 cards drawn from your shuffled deck. You play them freely; there is no action-point cost beyond trace.
- **Phase track** — the current breach phase and your progress toward advancing it.
- **Active synergies** — lights up when you trigger a synergy bonus.

### Turn structure

1. Play as many tools from your hand as you want, in any order.
2. Click **END TURN** when done.
3. The IDS counterattacks (adds trace, may heal the node). See [Section 7](#7-trace--ids--the-real-enemy).
4. Your hand is discarded and you draw a fresh 5 (6 with Recon Dump upgrade).
5. Repeat until the node's HP hits 0 (you win) or your trace maxes out (run over).

### Retreating

**RETREAT** exits the breach immediately at a cost of **+2 trace**. The node keeps whatever HP damage you dealt. Sometimes retreating on low HP to save trace for harder nodes ahead is the right call.

---

## 5. Breach Phases

Every breach is divided into sequential phases. Playing tools whose **phase tag matches the current phase** advances your progress toward the next phase.

| Phase | Colour | Goal |
|---|---|---|
| **RECON** | Blue | Enumerate the target. Reveal weaknesses. Set up your attack. |
| **ACCESS** | Green | Gain initial foothold. Login exploits and injection attacks. |
| **ESCALATE** | Purple | Elevate privileges. Buffs stack here. Most powerful tools live here. |
| **EXFIL** | Pink | Extract data. Finish the breach. Data multipliers are active. |

**Advancing a phase** requires playing **2 phase-appropriate cards** in a single turn. When you advance, you draw **1 bonus card** next turn as a reward.

### Phase sequences by node type

Not every node has every phase — simpler targets skip some:

| Node | Phases |
|---|---|
| Workstation, Mail Server, IoT | RECON → ACCESS → EXFIL |
| Web Server, Database, VPN Gateway, Core Router | RECON → ACCESS → ESCALATE → EXFIL |
| Firewall | RECON → ESCALATE → EXFIL |

### Playing out of phase

You can always play any card in any phase — the game doesn't lock you out. But playing a card outside its intended phase means you miss the phase-advance progress for that card. It is never *wasted*, just slower.

> **Key insight:** ESCALATE tools are your most powerful, but the Firewall node skips ACCESS entirely and goes straight to ESCALATE. This makes the Firewall uniquely hostile to social-engineering builds.

---

## 6. Your Tools (Card Database)

### Your Starting Deck

You begin every run with these 8 cards:

| Card | Phase | Damage | Trace | Effect |
|---|---|---|---|---|
| nmap Scan | RECON | 2 | 1 | Reveals node weakness |
| Phishing Link ×2 | RECON | 3 | 0 | +1 data; cheapens next card's trace |
| Default Creds | ACCESS | 3 | 0 | Clean and simple |
| Dict Attack | ACCESS | 5 | 1 | +1 trace |
| Ping Flood | ACCESS | 4 | 2 | Noisy — avoid on high-trace runs |
| Pastebin Exploit | ACCESS | 2 | 0 | 40% chance to backfire (+2 trace) |
| Packet Sniffer | RECON | 4 | 1 | +4 data |

The starting deck is functional but thin on ESCALATE and EXFIL coverage. **Your first few upgrades should address this.**

---

### Full Tool Reference

#### Tier 0 — Script Kiddie

| Tool | Phase | DMG | Trace | Notes |
|---|---|---|---|---|
| **Ping Flood** | ACCESS | 4 | 2 | Cheap damage, heavy trace. Use sparingly. |
| **Default Creds** | ACCESS | 3 | 0 | Zero trace. Best opener. |
| **nmap Scan** | RECON | 2 | 1 | Reveals weakness — play early every breach. |
| **Dict Attack** | ACCESS | 5 | 1 | Solid damage-per-trace ratio. |
| **Phishing Link** | RECON | 3 | 0 | Free damage + makes next card trace-cheaper. |
| **Pastebin Exploit** | ACCESS | 2 | 0 | Risky — 40% chance of +2 bonus trace. |

---

#### Tier 1 — Grey Hat

| Tool | Phase | DMG | Trace | Notes |
|---|---|---|---|---|
| **SQL Injection** | ACCESS | 7 | 1 | +2 data. Excellent value. |
| **Port Knock** | RECON | 0 | 1 | +2 stealth + reveals weakness. No direct damage — but stealth blocks ICE. |
| **ARP Spoof** | ESCALATE | 6 | 2 | +3 data. Part of MitM Setup synergy. |
| **Metasploit** | ACCESS | 9 | 3 | Highest T1 damage but very noisy. |
| **Packet Sniffer** | RECON | 4 | 1 | +4 data. Data-farming staple. |
| **Rootkit** | ESCALATE | 5 | 3 | Permanently reduces all future trace costs by 1. Worth it mid-run. |

---

#### Tier 2 — Black Hat

| Tool | Phase | DMG | Trace | Notes |
|---|---|---|---|---|
| **Zero Day** | ESCALATE | 15 | 3 | **Single use per run.** Save for boss or the Firewall. |
| **VPN Chain** | Any | 0 | 2 | Halves all trace costs this turn + +3 stealth. Pure defence. |
| **Ransomware** | EXFIL | 12 | 4 | +8 data. Loud. Save for when you're ready to end the breach fast. |
| **Social Engineer** | ACCESS | 8 | 2 | No secondary effects but clean damage-per-trace. |
| **Kernel Exploit** | ESCALATE | 6 | 3 | Sets up **×2 damage** on next card. Combo with high-damage tools. |

---

#### Tier 3 — Ghost

| Tool | Phase | DMG | Trace | Notes |
|---|---|---|---|---|
| **APT Implant** | EXFIL | 20 | 4 | **Generates zero trace on use.** Best finisher in the game. |
| **Supply Chain** | EXFIL | 10 | 5 | +4 to **all** uncleared nodes. Strong when 3+ nodes remain. |
| **Memory Scrape** | EXFIL | 8 | 3 | +12 data. Best data card in game. |

---

## 7. Trace & IDS — The Real Enemy

**Trace** is the run-ending resource. It never resets between nodes — only specific upgrades and OPSEC actions can reduce it.

### How trace accumulates

- Each tool you play adds its `traceCost` to your global trace.
- Some tools add *bonus* trace on top of that.
- At the **end of every turn**, the IDS (Intrusion Detection System) adds additional trace equal to the node's `icePerTurn` value — regardless of what you played.

### ICE per turn by node

| Node | ICE/Turn |
|---|---|
| Workstation, Mail Server, IoT, Web Server | +1 |
| Database, VPN Gateway | +2 |
| Firewall, Core Router | +3 |

The Firewall and Core Router are brutal on slow strategies. You need to end those breaches in as few turns as possible.

### IDS Healing

Every time the IDS fires, it also **heals the node** by `floor(trace / 5)` HP. At trace 10 that's +2 HP/turn. At trace 15 that's +3 HP/turn. This is why letting trace climb while chipping slowly is a losing strategy — the node will heal faster than you can damage it.

### Stealth

**Stealth** is a buffer that absorbs ICE trace before it hits your global counter. Each point of stealth blocks 1 trace of ICE. Stealth decays by 1 each turn. Build it with Port Knock, VPN Chain, and the Tor Routing upgrade.

### The trace warning threshold

At **14+ trace**, the HUD goes red. You're entering dangerous territory. Above that, a single noisy card or two turns of ICE can end your run.

### Trace limits by organisation

| Organisation | Trace Limit |
|---|---|
| NOVABANQUE S.A. | 15 — extremely tight |
| AXIOM DEFENSE | 18 |
| PHARMA-CORP | 20 — standard |
| HELIX MEDIA | 22 |
| KRONOS SYSTEMS | 25 — most forgiving |

---

## 8. Synergies

Synergies trigger automatically when you play **both listed tools during the same breach** (not necessarily the same turn). The bonus fires as soon as the second card hits.

| Synergy | Tools Required | Bonus |
|---|---|---|
| **Recon → Strike** | nmap Scan + Metasploit | +6 DMG, −1 trace |
| **Port → Inject** | nmap Scan + SQL Injection | +4 DMG, +3 data |
| **Full Con** | Phishing Link + Social Engineer | +5 DMG, no trace this turn |
| **Login Bypass** | Default Creds + SQL Injection | +8 data |
| **Ghost Protocol** | VPN Chain + APT Implant | Zero trace this turn, +10 DMG |
| **Root 0day** | Kernel Exploit + Zero Day | Triple damage on next card |
| **Deep Persist** | Rootkit + APT Implant | −2 trace cost on all tools, +5 stealth |
| **MitM Setup** | Packet Sniffer + ARP Spoof | +10 data, reveal all weaknesses |
| **Brute Combo** | Dict Attack + Default Creds | +3 DMG per brute/login card in hand |
| **Total Chaos** | Ransomware + Supply Chain | 8 DMG to all nodes, +5 data, +3 trace |

### Synergy tips

- **Ghost Protocol** is arguably the strongest in the game. Zero trace + bonus damage on what is already a 20-damage card. Prioritise building toward this when you have either half.
- **Root 0day** (Kernel Exploit → Zero Day) turns the single-use Zero Day into a 45+ damage hit (15 × 3). Use it on the Mainframe.
- **Login Bypass** (+8 data) is underrated for pure data farming runs.
- **Brute Combo** scales with your current hand — play it when you have several brute/login cards remaining.

---

## 9. Node Types & Threat Levels

### Standard Nodes

| Node | HP | ICE/Turn | Weakness Tags | Data | Threat |
|---|---|---|---|---|---|
| 📷 **IoT Device** | 80 | 1 | brute, login, scan | 3 | Trivial — kill in one or two turns |
| 💻 **Workstation** | 120 | 1 | social, login | 4 | Easy — social tools shine here |
| 📧 **Mail Server** | 180 | 1 | social, login, exploit | 10 | Medium — great data reward |
| 🌐 **Web Server** | 200 | 1 | web, exploit | 7 | Medium — has ESCALATE phase |
| 🗄️ **Database** | 280 | 2 | web, exploit, scan | 15 | Hard — best data in the network |
| 🖥️ **Admin Terminal** | 300 | 2 | exploit, mitm, social | 8 | Hard — gives 2 tool rewards |
| 🔥 **Firewall** | 380 | 3 | network, zero-day | 5 | Brutal — no ACCESS phase, ICE is +3 |

### Boss Node

| Node | HP | ICE/Turn | Weakness | Data | Notes |
|---|---|---|---|---|---|
| 👑 **Mainframe** | 500 | 3 | None | 30 | No weaknesses. Save your best tools. |

### Node targeting strategy

- **IoT Devices** are free damage — breach them early to unlock the next layer and grab stealth before harder nodes.
- **Databases** offer the best data reward of any standard node. If you need data for an OPSEC Pivot, prioritise these.
- **The Firewall** is the hardest standard node. Its unique phase sequence (RECON → ESCALATE → EXFIL) punishes social builds and rewards players who already have high-tier escalation tools. Consider building Tier 2 tools before engaging.
- **The Mainframe** has no weakness tags, meaning you get no damage bonus from tag matching. Raw damage output is all that matters. Save Zero Day and APT Implant for here.

---

## 10. Upgrades

After clearing each node (except the boss), you choose **one passive upgrade** and optionally **one new tool** to add to your deck. Upgrades persist for the rest of the run and stack.

| Upgrade | Effect | Best For |
|---|---|---|
| 🌑 **Dark VPN** | All trace gains −1 (min 0) | Any run — universally strong |
| 🧅 **Tor Routing** | Start each breach with +2 stealth | Slow/grinding strategies |
| ⚡ **Cached Exploit** | First tool each breach is trace-free | Rush strategies; node openers |
| 📦 **Recon Dump** | Draw 1 extra card per turn | Combo/synergy builds |
| 🔧 **Compiled Tool** | All tools +2 damage | Early pick — scales for the whole run |
| 💾 **ExploitDB Sub** | Tier 1 tools deal double damage | Tier 1 heavy decks |
| 👁 **Insider Tip** | All weaknesses pre-revealed | Any build — instant value |
| 🔥 **Burner Account** | Once per run: clear 5 trace | Emergency safety net |
| ✨ **Zero Cool** | Synergy bonuses deal 50% more damage | Synergy-focused builds |
| 🛒 **Black Market** | Extra tool offer after each node | Deck-building flexibility |

### Upgrade priority

**Early run (nodes 1–2):**
Dark VPN and Compiled Tool are the strongest early picks. Dark VPN compounds — every trace-generating card for the rest of the run costs 1 less. Compiled Tool's +2 is modest but it applies to every card you ever play.

**Mid run (nodes 3–4):**
Recon Dump dramatically increases consistency. More cards per turn means faster phase advancement and more synergy opportunities. ExploitDB Sub is exceptional if you've added SQL Injection, Rootkit, or ARP Spoof.

**Late run (node 5+):**
Burner Account is your panic button — save it for the Mainframe if you arrive above trace 10. Zero Cool only pays off if you have multiple synergies in your deck.

---

## 11. OPSEC Console

The **OPSEC Console** (OPSEC ▼ button) gives you three powerful out-of-breach actions. Each starts with 1 charge and recharges by 1 (up to 2 max) after each successful node breach. You cannot use OPSEC during an active breach.

### Go Dark 🌑
**Effect:** −3 trace. All uncleared nodes harden (+10% HP). 50% chance each revealed weakness goes dark again.

Use it when you're above trace 12 and not yet committed to a node. The HP penalty is real — nodes that started at 200 HP become 220. Avoid using this more than once unless you're desperate.

### Log Wipe 🗑
**Effect:** A mini-game. 4 of your breach log entries appear among several clean system logs. Click your logs to wipe them within the time limit.

- **Perfect wipe** (all 4 found): −5 trace
- **Partial wipe**: −2 trace, +1 per missed log
- **False positive** (clicking a clean log): +1 trace immediately

This is the best trace reduction in the game *if you play it well*. Your logs have a distinct pattern — they reference your session IP, unusual commands, and off-hours access. Clean logs look like routine system events.

### Pivot Route 🔀
**Cost:** 10 data  
**Effect:** The next breach you enter gains −1 trace per card played and halved ICE retaliation.

Extremely powerful before a Firewall or Mainframe breach. Save data by farming the Database first, then Pivot before the hardest node.

---

## 12. Target Organisations

The organisation is randomly chosen at run start and determines your **trace limit** and **network size**.

| Organisation | Trace Limit | Nodes | Difficulty | Notes |
|---|---|---|---|---|
| **NOVABANQUE S.A.** | 15 | 5 | ★★★★★ | Brutal. One noisy turn can end the run. Stealth-only build required. |
| **AXIOM DEFENSE** | 18 | 6 | ★★★★☆ | Tight. Avoid Metasploit and Ping Flood. |
| **PHARMA-CORP** | 20 | 6 | ★★★☆☆ | Standard. Good for learning. |
| **HELIX MEDIA** | 22 | 7 | ★★☆☆☆ | Forgiving limit but more nodes = more IDS exposure. |
| **KRONOS SYSTEMS** | 25 | 8 | ★★☆☆☆ | Most nodes but highest limit. Strong for synergy builds. |

---

## 13. Strategies & Build Guides

### The Ghost Run (Stealth/Low-Trace)

**Goal:** Keep trace under 10 for the entire run. IDS healing becomes negligible.

**Core tools to pick up:** Port Knock, VPN Chain, APT Implant, Rootkit  
**Key synergy:** Ghost Protocol (VPN Chain + APT Implant)  
**Key upgrades:** Dark VPN (essential), Tor Routing, Burner Account  
**Avoid:** Metasploit, Ping Flood, Ransomware, anything with trace cost 3+

**How it plays:** Open every breach with Port Knock (stealth + weakness reveal). Use VPN Chain to halve trace on heavy turns. Rootkit mid-run reduces all trace costs permanently. APT Implant does 20 damage with zero trace — it becomes your primary finisher. Save Zero Day for the Mainframe.

**Best against:** NOVABANQUE (the only strategy that survives a 15-limit run).

---

### The Brute (Raw Damage)

**Goal:** End every breach in 2–3 turns before IDS has time to heal.

**Core tools:** Metasploit, Dict Attack, Kernel Exploit, Zero Day  
**Key synergy:** Root 0day (Kernel Exploit + Zero Day = ×3 Zero Day)  
**Key upgrades:** Compiled Tool, ExploitDB Sub, Cached Exploit  
**Avoid:** Port Knock, VPN Chain (wasted turns with no damage)

**How it plays:** Hit hard and fast. Play Kernel Exploit immediately before Zero Day for the Root 0day synergy — that's 45 damage in two cards. Use Cached Exploit so the opener each breach is free. Accept higher trace as the cost of speed. Use Burner Account as your safety valve.

**Best against:** KRONOS (25-limit gives you room to be loud; 8 nodes means you want speed).

---

### The Data Farmer

**Goal:** Maximise data exfiltrated. Opens up Pivot Route every breach.

**Core tools:** Packet Sniffer, Memory Scrape, ARP Spoof, SQL Injection  
**Key synergies:** MitM Setup (Packet Sniffer + ARP Spoof), Login Bypass (Default Creds + SQL Injection)  
**Key upgrades:** Black Market (more tool offers), Recon Dump, Insider Tip  
**Target priority:** Database first, then Mail Server

**How it plays:** Farm data on early nodes to keep Pivot Route funded (costs 10 data). Pivot before every high-ICE node. Memory Scrape (+12 data per play) is your crown jewel — add it as soon as it appears. The MitM Setup synergy (+10 data + weakness reveal) is exceptional value.

**Best against:** HELIX MEDIA or KRONOS (more nodes = more farming opportunities).

---

### The Synergy Engine

**Goal:** Chain as many synergies as possible in a single run.

**Core tools:** Collect at least one card from 4+ synergy pairs  
**Key upgrades:** Zero Cool (synergy bonuses +50%), Recon Dump, Black Market  
**Key synergies to stack:** Full Con + Login Bypass + MitM Setup

**How it plays:** Think of your deck as a web of combos. Phishing Link sets up Full Con and Brute Combo. nmap Scan sets up Recon → Strike and Port → Inject. Default Creds enables both Login Bypass and Brute Combo. With Zero Cool, each synergy bonus does 50% more damage — MitM Setup becomes +15 damage + reveal all, Ghost Protocol becomes 25 damage at zero trace.

**Best against:** PHARMA-CORP or HELIX MEDIA (enough nodes to assemble the full engine).

---

## 14. Quick Reference

### Trace Do's and Don'ts

| ✅ Do | ❌ Don't |
|---|---|
| Open with Default Creds (0 trace) | Open with Ping Flood (+2 trace immediately) |
| Reveal weakness before playing heavy tools | Brute force nodes without knowing weaknesses |
| Use OPSEC Log Wipe before it's an emergency | Save OPSEC for when you're already at the limit |
| Retreat if you'll hit max trace next turn | Stay in a losing breach out of pride |
| Play stealth tools before ESCALATE phase | Ignore stealth when Firewall ICE is +3/turn |

### Weakness Tag → Tool Tag Matching

| Node | Best Tool Tags |
|---|---|
| Workstation, Mail Server | `social`, `login` |
| Web Server, Database | `web`, `exploit` |
| Database (also) | `scan` |
| Firewall | `network`, `zero-day` |
| IoT Device | `brute`, `login`, `scan` |
| Admin Terminal | `exploit`, `mitm`, `social` |
| Mainframe | *(no weaknesses — raw damage only)* |

### Phase → Tool Tag Cheat Sheet

| Phase | Tool tags that advance it |
|---|---|
| RECON | `recon`, `scan`, `social` |
| ACCESS | `login`, `brute`, `exploit`, `social`, `web` |
| ESCALATE | `escalate`, `persist`, `mitm`, `network` |
| EXFIL | `exploit`, `recon`, `noise`, `stealth`, `persist`, `network` |

### Emergency Decisions

- **Trace 12+, still in a breach:** Play only zero-trace cards. End turn only if you must.
- **Trace 16+, IDS healing faster than you damage:** Retreat (+2 trace) is better than losing the run.
- **Mainframe breach, trace already high:** Use Burner Account first, then Pivot Route if you have it. APT Implant (0 trace) should be your primary damage card.
- **Firewall with no ESCALATE tools:** Skip it if possible and come back after adding better tools via upgrades. If you can't skip it, Retreat is not shameful.

---

*Guide accurate as of v3.1. Subject to change as the game develops.*
