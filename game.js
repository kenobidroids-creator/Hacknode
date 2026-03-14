// ============================================================
//  HACKNODE — Game Engine  v3.1
// ============================================================

const GameState = {
  phase:'menu', org:null, runData:0, totalTrace:0, stealth:0,
  upgrades:[], tier:0, score:0, multiplier:1.0,
  nodes:[], currentNodeIndex:null, nodesCleared:0,
  currentNode:null, nodeHp:0, nodeMaxHp:0, nodeWeaknessRevealed:false, vaultUnlocked:false,
  deck:[], hand:[], discard:[], playedThisTurn:[], nodePlayedIds:[],
  turnEffects:{}, persistentEffects:{}, runState:{}, activeSynergies:[],
};

function startRun(){
  const org=ORGS[Math.floor(Math.random()*ORGS.length)];
  CONFIG.maxTrace=org.traceLimit;
  Object.assign(GameState,{
    phase:'map',org,runData:0,totalTrace:0,stealth:0,upgrades:[],tier:0,score:0,multiplier:1.0,
    nodesCleared:0,deck:buildStartingDeck(),discard:[],hand:[],currentNodeIndex:null,
    persistentEffects:{},activeSynergies:[],nodePlayedIds:[],playedThisTurn:[],runState:{},
  });
  GameState.nodes=generateNetwork(org);
  UI.renderMap();
}

function buildStartingDeck(){
  return CONFIG.startingDeckIds.map(id=>TOOLS.find(t=>t.id===id)).filter(Boolean);
}

function generateNetwork(org){
  const count=org.nodes;
  const pool=NODE_TYPES.filter(n=>!n.isBoss);
  const shuffled=[...pool].sort(()=>Math.random()-0.5);
  const picked=shuffled.slice(0,count-1);
  const crown=NODE_TYPES.find(n=>n.isBoss);
  return [...picked,crown].map((type,i)=>({
    ...type,index:i,hp:type.maxHp,cleared:false,locked:i>0,weaknessRevealed:false,
  }));
}

function unlockNextNodes(){
  const cleared=GameState.nodes.filter(n=>n.cleared).length;
  GameState.nodes.forEach(n=>{if(!n.cleared&&n.index<=cleared)n.locked=false;});
}

function enterNode(nodeIndex){
  const node=GameState.nodes[nodeIndex];
  if(!node||node.locked||node.cleared)return;
  GameState.phase='hack';
  GameState.currentNodeIndex=nodeIndex;
  GameState.currentNode=node;
  GameState.nodeHp=node.hp;
  GameState.nodeMaxHp=node.maxHp;
  GameState.nodeWeaknessRevealed=node.weaknessRevealed;
  GameState.vaultUnlocked=false;
  GameState.nodePlayedIds=[];
  GameState.playedThisTurn=[];
  GameState.turnEffects={};
  GameState.activeSynergies=[];
  if(GameState.persistentEffects.startStealth2)GameState.stealth=Math.max(GameState.stealth,2);
  shuffleDeck();
  drawCards(handSize());
  UI.renderHack();
}

function handSize(){
  let s=CONFIG.handSize;
  if(GameState.persistentEffects.drawPlus1)s+=1;
  return s;
}

function shuffleDeck(){
  const all=[...GameState.deck,...GameState.discard,...GameState.hand];
  GameState.deck=all.sort(()=>Math.random()-0.5);
  GameState.discard=[];
  GameState.hand=[];
}

function drawCards(n){
  for(let i=0;i<n;i++){
    if(GameState.deck.length===0){
      if(GameState.discard.length===0)break;
      GameState.deck=[...GameState.discard].sort(()=>Math.random()-0.5);
      GameState.discard=[];
    }
    if(GameState.deck.length>0)GameState.hand.push(GameState.deck.pop());
  }
}

function playTool(handIndex){
  const tool=GameState.hand[handIndex];
  if(!tool)return;
  const isFirst=GameState.playedThisTurn.length===0;
  if(GameState.persistentEffects.firstToolFree&&isFirst)GameState.turnEffects._firstFree=true;
  const ctx=buildContext(tool);
  const dbl=!!GameState.turnEffects.doubleTrigger;
  if(dbl)delete GameState.turnEffects.doubleTrigger;
  tool.effect(ctx);
  if(dbl)tool.effect(ctx);
  delete GameState.turnEffects._firstFree;
  GameState.playedThisTurn.push(tool);
  if(!GameState.nodePlayedIds.includes(tool.id))GameState.nodePlayedIds.push(tool.id);
  GameState.hand.splice(handIndex,1);
  GameState.discard.push(tool);
  checkSynergies();
  updateTierAndMult();
  if(GameState.nodeHp<=0){GameState.nodeHp=0;UI.renderHack();setTimeout(()=>nodeCleared(),500);return;}
  UI.renderHack();
}

function buildContext(tool){
  return {
    hand:GameState.hand,
    getState(k){return GameState.runState[k];},
    setState(k,v){GameState.runState[k]=v;},
    showMessage(m){UI.showToast(m);},
    dealDamage(amount){
      let d=amount;
      if(GameState.persistentEffects.globalDamagePlus10)d+=10;
      if(GameState.persistentEffects.uncommonDouble&&tool.rarity===1)d*=2;
      if(GameState.turnEffects.doubleDamage){d*=2;delete GameState.turnEffects.doubleDamage;}
      if(GameState.turnEffects.tripleDamage){d*=3;delete GameState.turnEffects.tripleDamage;}
      if(tool.tags.includes('logic')&&GameState.persistentEffects.logicCritBonus){
        if(Math.random()<GameState.persistentEffects.logicCritBonus){
          d=Math.floor(d*2.5);UI.showFloatingNumber(d,'crit');return;
        }
      }
      if(GameState.nodeWeaknessRevealed&&GameState.currentNode){
        const weak=GameState.currentNode.weakness||[];
        if(tool.tags.some(t=>weak.includes(t)))d=Math.floor(d*1.5);
      }
      d=Math.floor(d*GameState.multiplier);
      GameState.nodeHp=Math.max(0,GameState.nodeHp-d);
      UI.showFloatingNumber(d,'damage');
    },
    addTrace(amount){
      if(GameState.turnEffects._firstFree)return;
      if(GameState.turnEffects.noTrace)return;
      if(amount<0){GameState.totalTrace=Math.max(0,GameState.totalTrace+amount);return;}
      if(GameState.turnEffects.halfTrace)amount=Math.ceil(amount/2);
      let a=amount;
      if(GameState.persistentEffects.globalTraceMinus1)a=Math.max(0,a-1);
      if(GameState.persistentEffects.traceReduction)a=Math.ceil(a*(1-GameState.persistentEffects.traceReduction));
      GameState.totalTrace=Math.min(CONFIG.maxTrace,GameState.totalTrace+a);
      UI.updateHUD();
      if(GameState.totalTrace>=CONFIG.maxTrace)setTimeout(()=>triggerGameOver('trace'),600);
    },
    gainData(a){GameState.runData+=a;GameState.score+=a*10;UI.showFloatingNumber(a,'data');},
    addStealth(a){GameState.stealth=Math.max(0,GameState.stealth+a);},
    revealWeakness(){GameState.nodeWeaknessRevealed=true;if(GameState.currentNode)GameState.currentNode.weaknessRevealed=true;},
    unlockVault(){if(!GameState.vaultUnlocked){GameState.vaultUnlocked=true;GameState.runData+=5;UI.showToast('🔓 Vault +5 data');}},
    addTurnEffect(k,v){GameState.turnEffects[k]=v;},
    addPersistentEffect(k,v){GameState.persistentEffects[k]=(GameState.persistentEffects[k]||0)+v;},
    damageAllNodes(a){GameState.nodes.forEach(n=>{if(!n.cleared)n.hp=Math.max(0,n.hp-a);});UI.showToast(`💥 Network −${a} to all`);},
  };
}

function checkSynergies(){
  SYNERGIES.forEach(syn=>{
    if(!syn.ids.every(id=>GameState.nodePlayedIds.includes(id)))return;
    if(GameState.activeSynergies.some(s=>s.ids.join()===syn.ids.join()))return;
    GameState.activeSynergies.push(syn);
    const ctx=buildContext({tags:[],tier:0,rarity:0});
    syn.bonusEffect(ctx);
    UI.showSynergyFlash(syn);
  });
}

function nodeCleared(){
  const node=GameState.currentNode;
  node.cleared=true;node.hp=0;GameState.nodesCleared++;
  GameState.runData+=node.reward.data;
  GameState.score+=node.reward.data*20+100;
  unlockNextNodes();
  if(node.isBoss){setTimeout(()=>triggerWin(),600);return;}
  GameState.phase='upgrade';
  GameState.pendingToolRewards=node.reward.tools;
  UI.renderUpgrade(node.reward.tools);
}

function selectUpgrade(id){
  if(GameState.upgrades.find(g=>g.id===id))return;
  const u=UPGRADES.find(u=>u.id===id);if(!u)return;
  GameState.upgrades.push(u);applyUpgrade(u);UI.markUpgradeSelected(id);
}

function applyUpgrade(u){
  const p=GameState.persistentEffects;
  switch(u.effect){
    case'globalTraceMinus1':  p.globalTraceMinus1=true;  break;
    case'startStealth2':      p.startStealth2=true;      break;
    case'firstToolFree':      p.firstToolFree=true;      break;
    case'burnerClear':        p.burnerClear=true;        break;
    case'drawPlus1':          p.drawPlus1=true;          break;
    case'globalDamagePlus10': p.globalDamagePlus10=true; break;
    case'revealAll':          GameState.nodes.forEach(n=>n.weaknessRevealed=true); break;
    case'uncommonDouble':     p.uncommonDouble=true;     break;
    case'zeroDayReset':       p.zeroDayReset=true;       break;
    case'overclockFree':      p.overclockFree=true;      break;
  }
}

function addToolToDeck(id){
  const tool=TOOLS.find(t=>t.id===id);if(!tool)return;
  const all=[...GameState.deck,...GameState.discard,...GameState.hand];
  if(all.some(c=>c.id===id)){UI.showToast('Already in loadout!');return;}
  GameState.deck.push(tool);
}

function skipToolReward(){}
function continueToMap(){GameState.phase='map';UI.renderMap();}

function updateTierAndMult(){
  if(!GameState.playedThisTurn.length)return;
  GameState.tier=Math.max(GameState.tier,Math.max(...GameState.playedThisTurn.map(t=>t.tier||0)));
  GameState.multiplier=parseFloat((1.0+GameState.nodePlayedIds.length*0.1).toFixed(2));
}

function triggerGameOver(r){GameState.phase='gameover';UI.renderGameOver(r);}
function triggerWin(){GameState.phase='win';UI.renderWin();}

function endTurn(){
  GameState.discard.push(...GameState.hand);
  GameState.hand=[];
  GameState.turnEffects={};
  GameState.playedThisTurn=[];
  const ids=Math.floor(GameState.totalTrace/6);
  if(ids>0){GameState.nodeHp=Math.min(GameState.nodeHp+ids,GameState.nodeMaxHp);UI.showToast(`🛡 IDS Regen +${ids} HP`);}
  GameState.stealth=Math.max(0,GameState.stealth-1);
  drawCards(handSize());
  UI.renderHack();
}

function useBurner(){
  if(!GameState.persistentEffects.burnerClear||GameState.persistentEffects.burnerUsed)return;
  GameState.totalTrace=Math.max(0,GameState.totalTrace-5);
  GameState.persistentEffects.burnerUsed=true;
  UI.updateHUD();UI.showToast('🔥 Burner used: −5 trace');UI.renderHack();
}

function generateToolOffers(){
  const max=Math.min(3,GameState.tier+1);
  const all=[...GameState.deck,...GameState.discard,...GameState.hand];
  const owned=new Set(all.map(c=>c.id));
  const elig=TOOLS.filter(t=>t.rarity<=max&&!owned.has(t.id));
  return [...elig].sort(()=>Math.random()-0.5).slice(0,3);
}
