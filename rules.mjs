export const initial='rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR';
export const side=p=>p===p.toUpperCase()?'r':'b';
export function board(f=initial){return f.split('/').flatMap(r=>[...r].flatMap(c=>/\d/.test(c)?Array(+c).fill(null):[c]));}
export function fen(b,t){let rows=[];for(let y=0;y<10;y++){let s='',n=0;for(let x=0;x<9;x++){let p=b[y*9+x];if(!p)n++;else{if(n)s+=n;n=0;s+=p;}}if(n)s+=n;rows.push(s);}return rows.join('/').replaceAll('h','n').replaceAll('H','N').replaceAll('e','b').replaceAll('E','B')+' '+(t==='r'?'w':'b')+' - - 0 1';}
export function raw(b,a,z){let p=b[a];if(!p||a===z||z<0||z>=90||b[z]&&side(b[z])===side(p))return false;let x=a%9,y=Math.floor(a/9),u=z%9,v=Math.floor(z/9),dx=u-x,dy=v-y,r=side(p)==='r',k=p.toLowerCase(),pal=u>=3&&u<=5&&(r?v>=7:v<=2);let count=0;if(dx===0||dy===0){let step=dx===0?Math.sign(dy)*9:Math.sign(dx);for(let i=a+step;i!==z;i+=step)if(b[i])count++;}
if(k==='k')return pal&&Math.abs(dx)+Math.abs(dy)===1;
if(k==='a')return pal&&Math.abs(dx)===1&&Math.abs(dy)===1;
if(k==='e')return Math.abs(dx)===2&&Math.abs(dy)===2&&(r?v>=5:v<=4)&&!b[(y+dy/2)*9+x+dx/2];
if(k==='h')return Math.abs(dx)*Math.abs(dy)===2&&!b[Math.abs(dx)===2?y*9+x+Math.sign(dx):(y+Math.sign(dy))*9+x];
if(k==='r')return (dx===0||dy===0)&&count===0;
if(k==='c')return (dx===0||dy===0)&&count===(b[z]?1:0);
if(k==='p')return dx===0&&dy===(r?-1:1)||(r?y<=4:y>=5)&&dy===0&&Math.abs(dx)===1;
return false;}
export function check(b,s){let k=b.findIndex(p=>p===(s==='r'?'K':'k'));if(k<0)return true;let other=b.findIndex(p=>p===(s==='r'?'k':'K'));if(other>=0&&k%9===other%9){let clear=true;for(let i=Math.min(k,other)+9;i<Math.max(k,other);i+=9)if(b[i])clear=false;if(clear)return true;}return b.some((p,i)=>p&&side(p)!==s&&raw(b,i,k));}
export function legal(b,a,z,s){if(!b[a]||side(b[a])!==s||b[z]?.toLowerCase()==='k'||!raw(b,a,z))return false;let c=b.slice();c[z]=c[a];c[a]=null;return !check(c,s);}
export function moves(b,s){let m=[];for(let a=0;a<90;a++)if(b[a]&&side(b[a])===s)for(let z=0;z<90;z++)if(legal(b,a,z,s))m.push([a,z]);return m;}
export const uci=(a,z)=>String.fromCharCode(97+a%9)+(9-Math.floor(a/9))+String.fromCharCode(97+z%9)+(9-Math.floor(z/9));
export function decode(m){if(!/^[a-i][0-9][a-i][0-9]$/.test(m))throw Error('无效引擎着法');return [(9-+m[1])*9+m.charCodeAt(0)-97,(9-+m[3])*9+m.charCodeAt(2)-97];}


export const pieceNames = {
  K:'帅', A:'仕', E:'相', H:'马', R:'车', C:'炮', P:'兵',
  k:'将', a:'士', e:'象', h:'马', r:'车', c:'炮', p:'卒',
};

// Use the position before the move to distinguish pieces on the same file.
export function chineseMove(position, from, to) {
  const piece = position[from];
  const red = side(piece) === 'r';
  const number = n => red ? '〇一二三四五六七八九'[n] : '０１２３４５６７８９'[n];
  const file = column => number(red ? 9 - column : column + 1);
  const fromFile = from % 9;
  const toFile = to % 9;
  const rankDelta = Math.floor(to / 9) - Math.floor(from / 9);
  const sameFile = position.flatMap((p, i) => p === piece && i % 9 === fromFile ? [i] : []);
  let prefix = pieceNames[piece] + file(fromFile);

  if (sameFile.length > 1) {
    const rank = red ? sameFile.indexOf(from) : sameFile.length - 1 - sameFile.indexOf(from);
    const order = rank === 0 ? '前' :
      rank === sameFile.length - 1 ? '后' :
      sameFile.length === 3 ? '中' : '一二三四五'[rank];
    prefix = order + pieceNames[piece];
    // Only pawns can stack on more than one file. Include the file for clarity.
    if (piece.toLowerCase() === 'p') {
      const counts = Array(9).fill(0);
      position.forEach((p, i) => { if (p === piece) counts[i % 9]++; });
      if (counts.filter(count => count > 1).length > 1) prefix += file(fromFile);
    }
  }

  const action = rankDelta === 0 ? '平' : (red ? rankDelta < 0 : rankDelta > 0) ? '进' : '退';
  const diagonal = 'hae'.includes(piece.toLowerCase());
  const destination = rankDelta === 0 || diagonal ? file(toFile) : number(Math.abs(rankDelta));
  return prefix + action + destination;
}
