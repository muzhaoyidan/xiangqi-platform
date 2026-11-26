import {variationNotice} from './adjudication.mjs';
import {newGame,applyMove,restore,undoTurn,searchRequests} from './game.mjs';
import {side,legal,check,decode,uci,chineseMove,pieceNames as names} from './rules.mjs';
const $=id=>document.getElementById(id);let game=newGame(), human='r', selected=null, thinking=false, gameId=crypto.randomUUID();
const requests=searchRequests();
function element(tag,attrs={},text=''){let n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(let [k,v]of Object.entries(attrs))n.setAttribute(k,v);n.textContent=text;return n;}
function render() {
  const {board:b,turn,history,result,pending}=game;
  const svg = $('board');
  const focusedSquare = document.activeElement?.dataset.square;
  const fragment = document.createDocumentFragment();
  const append = (...nodes) => fragment.append(...nodes);
  const definitions = element('defs');
  const wood = element('linearGradient', {id:'wood', x2:'1', y2:'1'});
  wood.append(element('stop', {offset:'0%', 'stop-color':'#f4d7a2'}),
              element('stop', {offset:'100%', 'stop-color':'#dcac72'}));
  definitions.append(wood);
  append(definitions, element('rect',{width:540,height:600,fill:'url(#wood)'}));
  const line = d => element('path',{d,stroke:'#805533',fill:'none'});
  for(let y=30;y<=570;y+=60) append(line(`M30 ${y}H510`));
  for(let x=30;x<=510;x+=60) {
    append(line(x===30||x===510 ? `M${x} 30V570` : `M${x} 30V270M${x} 330V570`));
  }
  for(let y of [30,450]) append(line(`M210 ${y}L330 ${y+120}M330 ${y}L210 ${y+120}`));
  append(element('text',{x:150,y:300,class:'river'},'楚 河'),
         element('text',{x:390,y:300,class:'river'},'汉 界'));
  const last = history.at(-1);
  const inCheck = check(b,turn);
  const playable = turn===human && !thinking && !result;
  for(let i=0;i<90;i++) {
    const display = human==='b' ? 89-i : i;
    const x = 30+display%9*60, y = 30+Math.floor(display/9)*60;
    const piece = b[i];
    const target = playable && selected!==null && legal(b,selected,i,turn);
    const selectable = playable && piece && side(piece)===human;
    const group = element('g',{'data-square':i, class:'board-square'});
    if(target||selectable) {
      group.setAttribute('role','button');
      group.setAttribute('tabindex','0');
      group.setAttribute('aria-label',`${piece ? names[piece]+' · ' : '落点 '}${uci(i,i).slice(0,2)}`);
    }
    if(last && (last.a===i||last.z===i)) {
      group.append(element('rect',{x:x-28,y:y-28,width:56,height:56,rx:8,fill:'#76501840'}));
    }
    if(piece) {
      const red = side(piece)==='r';
      const threatened = inCheck && piece===(turn==='r'?'K':'k');
      const ink = red?'#972f25':'#29211a';
      group.append(element('circle',{cx:x,cy:y+2,r:25,fill:'#65432355'}),
        element('circle',{cx:x,cy:y,r:25,fill:threatened?'#fbb1a2':'#fff1d3',
          stroke:threatened?'#ba3025':selected===i?'#177466':ink,
          'stroke-width':threatened||selected===i?4:2}),
        element('circle',{cx:x,cy:y,r:21,fill:'none',stroke:ink,opacity:'.35'}),
        element('text',{x,y,fill:ink,class:'piece'},names[piece]));
    }
    if(target) group.append(element('circle',{cx:x,cy:y,r:piece?28:7,fill:piece?'none':'#16776a',stroke:'#16776a','stroke-width':piece?3:0}));
    group.append(element('rect',{class:'hit',x:x-29,y:y-29,width:58,height:58,rx:8,fill:'transparent'}));
    append(group);
  }
  svg.replaceChildren(fragment);
  if(focusedSquare!==undefined) svg.querySelector(`[data-square="${focusedSquare}"][tabindex]`)?.focus({preventScroll:true});
  $('status').textContent = result || (thinking?'Pikafish 正在思考':(turn===human?'轮到你':'Pikafish 回合')) + (inCheck?' · 将军':'') + (pending?' · '+variationNotice(pending):'');
  $('status').dataset.tone = inCheck ? 'check' : '';
  $('count').textContent = `${history.length} 手`;
  $('empty-history').hidden = history.length>0;
  const rows=[];
  for(let i=0;i<history.length;i+=2) {
    const row=document.createElement('li');
    row.className='move-row';
    const number=document.createElement('span');
    number.textContent=i/2+1;
    row.append(number);
    for(const index of [i,i+1]) {
      const item=history[index], cell=document.createElement('span');
      cell.className=index===history.length-1?'move-text latest':'move-text';
      cell.textContent=item?chineseMove(item.before,item.a,item.z):'—';
      row.append(cell);
    }
    rows.push(row);
  }
  $('history').replaceChildren(...rows);
  $('history').scrollTop=$('history').scrollHeight;
  for(const [id,color] of [['human-card',human],['opponent-card',human==='r'?'b':'r']]) {
    const card=$(id);
    card.dataset.side=color;
    card.dataset.active=String(!result && turn===color);
    card.querySelector('.avatar').textContent=color==='r'?'帅':'将';
    card.querySelector('.color-label').textContent=color==='r'?'红方':'黑方';
    const captures=history.filter(h=>h.c&&side(h.p)===color).map(h=>names[h.c]);
    card.querySelector('.captures').textContent=captures.length?`吃子 · ${captures.join(' ')}`:'尚未吃子';
  }
  $('undo').disabled=!history.some(h=>h.turn===human);
  $('resign').disabled=Boolean(result);
  $('draw').disabled=Boolean(result);
}
function feedback(message='', isError=false, retry=false) {
  $('error').textContent=message;
  $('error').dataset.tone=isError?'error':'';
  $('retry').hidden=!retry;
}

function play(a,z) {
  game=applyMove(game,a,z);
  selected=null;
  render();
}
async function ai() {
  if(game.turn===human||game.result||thinking) return;
  thinking=true;
  const request=requests.begin();
  const start=performance.now();
  feedback();
  render();
  try {
    const response=await fetch('/api/ai',{
      method:'POST', headers:{'Content-Type':'application/json'}, signal:request.signal,
      body:JSON.stringify({moves:game.history.map(h=>[h.a,h.z]),gameId,settings:{
        time:+$('searchTime').value, depth:+$('depth').value,
        threads:+$('threads').value, hash:+$('hash').value,
      }}),
    });
    const data=await response.json();
    if(!response.ok) throw Error(data.error);
    if(request.current()) {
      play(...decode(data.move));
      $('time').textContent='AI 用时 '+((performance.now()-start)/1000).toFixed(2)+' 秒';
    }
  } catch(error) {
    if(request.current()) feedback(error.message,true,true);
  } finally {
    if(request.current()) {
      thinking=false;
      render();
    }
  }
}
function cancelSearch() {
  requests.cancel();
  thinking=false;
  selected=null;
}
function click(i) {
  const {board:b,turn,result}=game;
  if(thinking||result||turn!==human) return;
  if(selected!==null&&legal(b,selected,i,turn)) {
    play(selected,i);
    ai();
    return;
  }
  selected=b[i]&&side(b[i])===human?i:null;
  render();
}
function square(event) {
  const svg=$('board');
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
  const x=Math.round((point.x-30)/60), y=Math.round((point.y-30)/60);
  if(x<0||x>8||y<0||y>9) return -1;
  const display=y*9+x;
  return human==='b'?89-display:display;
}
const svg=$('board');
let drag=null;
svg.onpointerdown=event=>{
  if(!event.isPrimary||event.button!==0) return;
  drag={id:event.pointerId,from:square(event)};
  svg.setPointerCapture(event.pointerId);
};
svg.onpointerup=event=>{
  if(drag?.id!==event.pointerId) return;
  const {from}=drag;
  drag=null;
  const to=square(event);
  const {board:b,turn,result}=game;
  if(to<0||from<0||thinking||result||turn!==human) return;
  if(from!==to&&b[from]&&side(b[from])===human) selected=from;
  click(to);
};
svg.onpointercancel=()=>{drag=null;};
svg.onkeydown=event=>{
  if(event.key!=='Enter'&&event.key!==' ') return;
  const square=event.target.closest('[data-square]');
  if(!square) return;
  event.preventDefault();
  click(Number(square.dataset.square));
};

$('difficulty').onchange=()=>$('searchTime').value=$('difficulty').value;
$('new').onclick=()=>{
  cancelSearch();
  game=newGame();
  gameId=crypto.randomUUID();
  human=$('side').value;
  feedback();
  $('time').textContent='等待开局';
  render();
  ai();
};
$('undo').onclick=()=>{
  cancelSearch();
  game=undoTurn(game,human);
  feedback();
  $('time').textContent='已悔棋';
  render();
};
$('save').onclick=()=>{
  localStorage.setItem('xiangqi-save',JSON.stringify({
    moves:game.history.map(h=>[h.a,h.z]), human, result:game.result,
  }));
  feedback('棋局已保存到当前浏览器');
};
$('load').onclick=()=>{
  try {
    const saved=restore(localStorage.getItem('xiangqi-save'));
    cancelSearch();
    game=saved.game;
    gameId=crypto.randomUUID();
    human=saved.human;
    $('side').value=human;
    feedback();
    $('time').textContent='棋局已恢复';
    render();
    ai();
  } catch(error) {
    feedback(error.message,true,game.turn!==human&&!thinking&&!game.result);
  }
};
$('resign').onclick=()=>{
  cancelSearch();
  game.result=(human==='r'?'黑方':'红方')+'获胜 · 玩家认输';
  render();
};
$('draw').onclick=()=>feedback('当前版本暂不支持 AI 接受提和。');
$('retry').onclick=ai;
render();
