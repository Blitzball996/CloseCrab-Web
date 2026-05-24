// Mini-games for CloseCrab-Web loading screen
// Each game: { name, hint, controls:'dpad'|'lr'|'tap'|'abxy', init(canvas), stop(), onInput(dir) }
const MiniGames = [];
let activeGame = null;

// === 1. Snake ===
MiniGames.push({
  name: 'Snake', hint: 'Swipe or use D-pad', controls: 'dpad',
  _iv: null, _snake: null, _food: null, _dir: null, _grid: 20,
  init(c) {
    const g = this; g._ctx = c.getContext('2d'); g._w = c.width; g._cell = c.width / g._grid;
    g._snake = [{x:10,y:10}]; g._dir = {x:1,y:0}; g._score = 0;
    g._food = g._place();
    g._iv = setInterval(() => g._tick(), 140);
  },
  stop() { clearInterval(this._iv); },
  onInput(d) {
    const m = {up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};
    const n = m[d]; if (!n) return;
    if (n.x !== -this._dir.x || n.y !== -this._dir.y) this._dir = n;
  },
  _place() { return {x:Math.floor(Math.random()*this._grid),y:Math.floor(Math.random()*this._grid)}; },
  _tick() {
    const g = this, s = g._snake, h = {x:(s[0].x+g._dir.x+g._grid)%g._grid, y:(s[0].y+g._dir.y+g._grid)%g._grid};
    if (s.some(p=>p.x===h.x&&p.y===h.y)) { g._snake=[{x:10,y:10}]; g._dir={x:1,y:0}; g._score=0; g._food=g._place(); }
    s.unshift(h);
    if (h.x===g._food.x&&h.y===g._food.y) { g._score++; g._food=g._place(); } else s.pop();
    g._draw();
  },
  _draw() {
    const g=this, ctx=g._ctx, c=g._cell;
    ctx.fillStyle='#1c1c1e'; ctx.fillRect(0,0,g._w,g._w);
    ctx.fillStyle='#ff453a'; ctx.beginPath(); ctx.arc((g._food.x+.5)*c,(g._food.y+.5)*c,c*.4,0,Math.PI*2); ctx.fill();
    g._snake.forEach((s,i)=>{ ctx.fillStyle=i?'#0a84ff':'#30d158'; ctx.fillRect(s.x*c+1,s.y*c+1,c-2,c-2); });
    ctx.fillStyle='#8e8e93'; ctx.font='12px sans-serif'; ctx.fillText('Score: '+g._score,8,16);
  }
});

// === 2. Tetris ===
MiniGames.push({
  name: 'Tetris', hint: 'Swipe L/R to move, Up to rotate, Down to drop', controls: 'dpad',
  _iv:null,
  init(c) {
    const g=this; g._ctx=c.getContext('2d'); g._W=10; g._H=18; g._cell=Math.floor(c.width/g._W);
    c.height = g._cell * g._H;
    g._board=Array.from({length:g._H},()=>Array(g._W).fill(0));
    g._score=0; g._spawn(); g._iv=setInterval(()=>g._tick(),500);
  },
  stop(){clearInterval(this._iv);},
  onInput(d){
    const g=this;
    if(d==='left') g._move(-1,0);
    else if(d==='right') g._move(1,0);
    else if(d==='down') { while(g._move(0,1)){} }
    else if(d==='up') g._rotate();
  },
  _shapes: [[[1,1,1,1]],[[1,1],[1,1]],[[0,1,1],[1,1,0]],[[1,1,0],[0,1,1]],[[1,0,0],[1,1,1]],[[0,0,1],[1,1,1]],[[0,1,0],[1,1,1]]],
  _colors: ['#64d2ff','#ffd60a','#30d158','#ff453a','#0a84ff','#bf5af2','#ff9f0a'],
  _spawn(){
    const i=Math.floor(Math.random()*7);
    this._piece=this._shapes[i].map(r=>[...r]); this._color=this._colors[i];
    this._px=Math.floor((this._W-this._piece[0].length)/2); this._py=0;
    if(!this._fits(this._px,this._py,this._piece)){this._board=Array.from({length:this._H},()=>Array(this._W).fill(0));this._score=0;}
  },
  _fits(px,py,p){
    for(let r=0;r<p.length;r++)for(let c=0;c<p[r].length;c++)
      if(p[r][c]){const x=px+c,y=py+r;if(x<0||x>=this._W||y>=this._H||(y>=0&&this._board[y][x]))return false;}
    return true;
  },
  _move(dx,dy){
    if(this._fits(this._px+dx,this._py+dy,this._piece)){this._px+=dx;this._py+=dy;this._draw();return true;}
    if(dy>0)this._lock();return false;
  },
  _rotate(){
    const p=this._piece,rows=p.length,cols=p[0].length;
    const rot=Array.from({length:cols},(_,c)=>Array.from({length:rows},(_,r)=>p[rows-1-r][c]));
    if(this._fits(this._px,this._py,rot)){this._piece=rot;this._draw();}
  },
  _lock(){
    const g=this,p=g._piece;
    for(let r=0;r<p.length;r++)for(let c=0;c<p[r].length;c++)
      if(p[r][c]&&g._py+r>=0)g._board[g._py+r][g._px+c]=g._color;
    // clear lines
    for(let r=g._H-1;r>=0;r--){if(g._board[r].every(v=>v)){g._board.splice(r,1);g._board.unshift(Array(g._W).fill(0));g._score+=10;r++;}}
    g._spawn();g._draw();
  },
  _tick(){if(!this._move(0,1)){}; this._draw();},
  _draw(){
    const g=this,ctx=g._ctx,c=g._cell,W=g._W,H=g._H;
    ctx.fillStyle='#1c1c1e';ctx.fillRect(0,0,c*W,c*H);
    for(let r=0;r<H;r++)for(let col=0;col<W;col++)if(g._board[r][col]){ctx.fillStyle=g._board[r][col];ctx.fillRect(col*c+1,r*c+1,c-2,c-2);}
    const p=g._piece;if(p)for(let r=0;r<p.length;r++)for(let col=0;col<p[r].length;col++)
      if(p[r][col]){ctx.fillStyle=g._color;ctx.fillRect((g._px+col)*c+1,(g._py+r)*c+1,c-2,c-2);}
    ctx.fillStyle='#8e8e93';ctx.font='12px sans-serif';ctx.fillText('Score: '+g._score,4,14);
  }
});

// === 3. Breakout ===
MiniGames.push({
  name:'Breakout', hint:'Swipe or L/R to move paddle', controls:'lr',
  _iv:null,
  init(c){
    const g=this; g._ctx=c.getContext('2d'); g._w=c.width; g._h=c.height;
    g._paddle={x:c.width/2-30,w:60,h:8}; g._ball={x:c.width/2,y:c.height-30,dx:2.5,dy:-2.5,r:5};
    g._bricks=[]; g._score=0;
    const cols=7,rows=4,bw=c.width/cols;
    for(let r=0;r<rows;r++)for(let col=0;col<cols;col++)g._bricks.push({x:col*bw+2,y:r*16+30,w:bw-4,h:12,alive:true});
    g._iv=setInterval(()=>g._tick(),16);
  },
  stop(){clearInterval(this._iv);},
  onInput(d){if(d==='left')this._paddle.x-=20;if(d==='right')this._paddle.x+=20;this._paddle.x=Math.max(0,Math.min(this._w-this._paddle.w,this._paddle.x));},
  _tick(){
    const g=this,b=g._ball,p=g._paddle;
    b.x+=b.dx;b.y+=b.dy;
    if(b.x<b.r||b.x>g._w-b.r)b.dx=-b.dx;
    if(b.y<b.r)b.dy=-b.dy;
    if(b.y>g._h-20&&b.x>p.x&&b.x<p.x+p.w){b.dy=-Math.abs(b.dy);b.dx+=(b.x-(p.x+p.w/2))*0.05;}
    if(b.y>g._h+20){b.x=g._w/2;b.y=g._h-30;b.dx=2.5;b.dy=-2.5;}
    for(const br of g._bricks){
      if(!br.alive)continue;
      if(b.x>br.x&&b.x<br.x+br.w&&b.y>br.y&&b.y<br.y+br.h){br.alive=false;b.dy=-b.dy;g._score+=10;}
    }
    if(g._bricks.every(br=>!br.alive)){const cols=7,rows=4,bw=g._w/cols;g._bricks=[];for(let r=0;r<rows;r++)for(let col=0;col<cols;col++)g._bricks.push({x:col*bw+2,y:r*16+30,w:bw-4,h:12,alive:true});}
    g._draw();
  },
  _draw(){
    const g=this,ctx=g._ctx;
    ctx.fillStyle='#1c1c1e';ctx.fillRect(0,0,g._w,g._h);
    ctx.fillStyle='#0a84ff';ctx.fillRect(g._paddle.x,g._h-14,g._paddle.w,g._paddle.h);
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(g._ball.x,g._ball.y,g._ball.r,0,Math.PI*2);ctx.fill();
    const colors=['#ff453a','#ff9f0a','#ffd60a','#30d158'];
    for(const br of g._bricks){if(!br.alive)continue;ctx.fillStyle=colors[Math.floor(br.y/16)%4];ctx.fillRect(br.x,br.y,br.w,br.h);}
    ctx.fillStyle='#8e8e93';ctx.font='12px sans-serif';ctx.fillText('Score: '+g._score,4,16);
  }
});

// === 4. Tank Battle ===
MiniGames.push({
  name:'Tank Battle', hint:'D-pad to move, tap center to fire', controls:'dpad_fire',
  _iv:null,
  init(c){
    const g=this; g._ctx=c.getContext('2d'); g._w=c.width; g._h=c.height;
    g._tank={x:c.width/2,y:c.height-30,dir:0,size:12}; // dir: 0=up,1=right,2=down,3=left
    g._bullets=[]; g._enemies=[]; g._score=0; g._tick_n=0;
    g._iv=setInterval(()=>g._tick(),33);
  },
  stop(){clearInterval(this._iv);},
  onInput(d){
    const g=this,t=g._tank,spd=4;
    if(d==='up'){t.dir=0;t.y-=spd;}else if(d==='down'){t.dir=2;t.y+=spd;}
    else if(d==='left'){t.dir=3;t.x-=spd;}else if(d==='right'){t.dir=1;t.x+=spd;}
    else if(d==='fire'){
      const dx=[0,5,0,-5],dy=[-5,0,5,0];
      g._bullets.push({x:t.x,y:t.y,dx:dx[t.dir],dy:dy[t.dir]});
    }
    t.x=Math.max(12,Math.min(g._w-12,t.x));t.y=Math.max(12,Math.min(g._h-12,t.y));
  },
  _tick(){
    const g=this; g._tick_n++;
    if(g._tick_n%40===0&&g._enemies.length<6){
      g._enemies.push({x:Math.random()*g._w,y:0,dy:1+Math.random()});
    }
    g._bullets.forEach(b=>{b.x+=b.dx;b.y+=b.dy;});
    g._bullets=g._bullets.filter(b=>b.x>0&&b.x<g._w&&b.y>0&&b.y<g._h);
    g._enemies.forEach(e=>{e.y+=e.dy;});
    // collision
    for(let i=g._bullets.length-1;i>=0;i--){
      for(let j=g._enemies.length-1;j>=0;j--){
        if(Math.abs(g._bullets[i].x-g._enemies[j].x)<12&&Math.abs(g._bullets[i].y-g._enemies[j].y)<12){
          g._bullets.splice(i,1);g._enemies.splice(j,1);g._score+=10;break;
        }
      }
    }
    g._enemies=g._enemies.filter(e=>e.y<g._h+20);
    g._draw();
  },
  _draw(){
    const g=this,ctx=g._ctx,t=g._tank;
    ctx.fillStyle='#1c1c1e';ctx.fillRect(0,0,g._w,g._h);
    // player tank
    ctx.fillStyle='#30d158';ctx.fillRect(t.x-t.size,t.y-t.size,t.size*2,t.size*2);
    ctx.fillStyle='#4cd964';
    const barrels=[[0,-14],[14,0],[0,14],[-14,0]];
    ctx.fillRect(t.x+barrels[t.dir][0]-2,t.y+barrels[t.dir][1]-2,4,4);
    // enemies
    ctx.fillStyle='#ff453a';g._enemies.forEach(e=>{ctx.fillRect(e.x-10,e.y-10,20,20);});
    // bullets
    ctx.fillStyle='#ffd60a';g._bullets.forEach(b=>{ctx.fillRect(b.x-2,b.y-2,4,4);});
    ctx.fillStyle='#8e8e93';ctx.font='12px sans-serif';ctx.fillText('Score: '+g._score,4,16);
  }
});

// === 5. Super Mario (simplified platformer) ===
MiniGames.push({
  name:'Mario Run', hint:'L/R to move, Up to jump', controls:'dpad',
  _iv:null,
  init(c){
    const g=this; g._ctx=c.getContext('2d'); g._w=c.width; g._h=c.height;
    g._player={x:40,y:0,vy:0,onGround:false,w:14,h:20};
    g._platforms=[{x:0,y:g._h-20,w:g._w,h:20}];
    g._coins=[]; g._score=0; g._scroll=0;
    for(let i=1;i<20;i++){
      g._platforms.push({x:Math.random()*(g._w-60)+30, y:g._h-20-i*50, w:50+Math.random()*40, h:10});
      if(Math.random()>0.4) g._coins.push({x:Math.random()*g._w, y:g._h-40-i*50, collected:false});
    }
    g._iv=setInterval(()=>g._tick(),20);
  },
  stop(){clearInterval(this._iv);},
  onInput(d){
    const p=this._player;
    if(d==='left')p.x-=8;if(d==='right')p.x+=8;
    if(d==='up'&&p.onGround){p.vy=-8;p.onGround=false;}
  },
  _tick(){
    const g=this,p=g._player;
    p.vy+=0.4; p.y+=p.vy; p.onGround=false;
    for(const pl of g._platforms){
      if(p.vy>=0&&p.x+p.w>pl.x&&p.x<pl.x+pl.w&&p.y+p.h>=pl.y&&p.y+p.h<=pl.y+12){
        p.y=pl.y-p.h;p.vy=0;p.onGround=true;
      }
    }
    if(p.y>g._h+50){p.x=40;p.y=0;p.vy=0;g._score=Math.max(0,g._score-5);}
    p.x=Math.max(0,Math.min(g._w-p.w,p.x));
    for(const c of g._coins){if(!c.collected&&Math.abs(p.x-c.x)<16&&Math.abs(p.y-c.y)<16){c.collected=true;g._score+=10;}}
    g._draw();
  },
  _draw(){
    const g=this,ctx=g._ctx;
    ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,g._w,g._h);
    ctx.fillStyle='#5c3d2e';for(const pl of g._platforms)ctx.fillRect(pl.x,pl.y,pl.w,pl.h);
    ctx.fillStyle='#ffd60a';for(const c of g._coins){if(!c.collected){ctx.beginPath();ctx.arc(c.x,c.y,5,0,Math.PI*2);ctx.fill();}}
    ctx.fillStyle='#ff453a';ctx.fillRect(g._player.x,g._player.y,g._player.w,g._player.h);
    ctx.fillStyle='#8e8e93';ctx.font='12px sans-serif';ctx.fillText('Score: '+g._score,4,16);
  }
});

// === 6. 100 Floors (NS-SHAFT style falling) ===
MiniGames.push({
  name:'100 Floors', hint:'L/R to move, fall down through platforms', controls:'lr',
  _iv:null,
  init(c){
    const g=this; g._ctx=c.getContext('2d'); g._w=c.width; g._h=c.height;
    g._player={x:c.width/2,y:20,vy:0,w:14,h:16};
    g._platforms=[]; g._score=0; g._spd=1;
    for(let i=0;i<8;i++) g._platforms.push({x:Math.random()*(g._w-60),y:60+i*35,w:50+Math.random()*30,h:6,type:0});
    g._iv=setInterval(()=>g._tick(),20);
  },
  stop(){clearInterval(this._iv);},
  onInput(d){if(d==='left')this._player.x-=10;if(d==='right')this._player.x+=10;this._player.x=Math.max(0,Math.min(this._w-14,this._player.x));},
  _tick(){
    const g=this,p=g._player;
    // scroll platforms up
    g._platforms.forEach(pl=>{pl.y-=g._spd;});
    g._platforms=g._platforms.filter(pl=>pl.y>-10);
    while(g._platforms.length<8){
      const last=g._platforms[g._platforms.length-1];
      g._platforms.push({x:Math.random()*(g._w-60),y:(last?last.y:g._h)+35,w:50+Math.random()*30,h:6,type:Math.random()>0.8?1:0});
    }
    // gravity
    p.vy+=0.3; p.y+=p.vy;
    // platform collision (land on top)
    for(const pl of g._platforms){
      if(p.vy>=0&&p.x+p.w>pl.x&&p.x<pl.x+pl.w&&p.y+p.h>=pl.y&&p.y+p.h<=pl.y+10){
        p.y=pl.y-p.h;p.vy=0;
      }
    }
    // ceiling = death
    if(p.y<0){p.y=60;p.vy=0;g._score=Math.max(0,g._score-5);}
    if(p.y>g._h){p.y=60;p.vy=0;g._score=Math.max(0,g._score-5);}
    g._score+=0.02; g._spd=1+Math.floor(g._score/50)*0.3;
    g._draw();
  },
  _draw(){
    const g=this,ctx=g._ctx;
    ctx.fillStyle='#0d1117';ctx.fillRect(0,0,g._w,g._h);
    for(const pl of g._platforms){ctx.fillStyle=pl.type?'#ff453a':'#30d158';ctx.fillRect(pl.x,pl.y,pl.w,pl.h);}
    ctx.fillStyle='#0a84ff';ctx.fillRect(g._player.x,g._player.y,g._player.w,g._player.h);
    ctx.fillStyle='#8e8e93';ctx.font='12px sans-serif';ctx.fillText('Floor: '+Math.floor(g._score),4,16);
  }
});

// === 7. Bomberman ===
MiniGames.push({
  name:'Bomberman', hint:'D-pad to move, center to place bomb', controls:'dpad_fire',
  _iv:null,
  init(c){
    const g=this; g._ctx=c.getContext('2d'); g._w=c.width; g._h=c.height;
    g._grid=13; g._cell=c.width/g._grid;
    g._player={x:1,y:1}; g._bombs=[]; g._explosions=[]; g._score=0;
    // generate map: 0=empty, 1=wall(fixed), 2=brick(breakable)
    g._map=Array.from({length:g._grid},(_,r)=>Array.from({length:g._grid},(_,col)=>{
      if(r===0||r===g._grid-1||col===0||col===g._grid-1)return 1;
      if(r%2===0&&col%2===0)return 1;
      if((r<=2&&col<=2))return 0; // safe zone
      return Math.random()>0.6?2:0;
    }));
    g._iv=setInterval(()=>g._tick(),33);
  },
  stop(){clearInterval(this._iv);},
  onInput(d){
    const g=this,p=g._player;
    let nx=p.x,ny=p.y;
    if(d==='up')ny--;if(d==='down')ny++;if(d==='left')nx--;if(d==='right')nx++;
    if(d==='fire'){g._bombs.push({x:p.x,y:p.y,timer:60});return;}
    if(nx>=0&&nx<g._grid&&ny>=0&&ny<g._grid&&g._map[ny][nx]===0){p.x=nx;p.y=ny;}
  },
  _tick(){
    const g=this;
    for(let i=g._bombs.length-1;i>=0;i--){
      g._bombs[i].timer--;
      if(g._bombs[i].timer<=0){
        const b=g._bombs[i]; g._bombs.splice(i,1);
        g._explode(b.x,b.y);
      }
    }
    g._explosions=g._explosions.filter(e=>{e.timer--;return e.timer>0;});
    g._draw();
  },
  _explode(bx,by){
    const g=this,dirs=[[0,-1],[0,1],[-1,0],[1,0]];
    g._explosions.push({x:bx,y:by,timer:15});
    for(const[dx,dy]of dirs){
      for(let r=1;r<=2;r++){
        const nx=bx+dx*r,ny=by+dy*r;
        if(nx<0||nx>=g._grid||ny<0||ny>=g._grid)break;
        if(g._map[ny][nx]===1)break;
        if(g._map[ny][nx]===2){g._map[ny][nx]=0;g._score+=10;g._explosions.push({x:nx,y:ny,timer:15});break;}
        g._explosions.push({x:nx,y:ny,timer:15});
      }
    }
  },
  _draw(){
    const g=this,ctx=g._ctx,c=g._cell;
    ctx.fillStyle='#1c1c1e';ctx.fillRect(0,0,g._w,g._h);
    for(let r=0;r<g._grid;r++)for(let col=0;col<g._grid;col++){
      if(g._map[r][col]===1){ctx.fillStyle='#636366';ctx.fillRect(col*c,r*c,c,c);}
      else if(g._map[r][col]===2){ctx.fillStyle='#8b5e3c';ctx.fillRect(col*c+1,r*c+1,c-2,c-2);}
    }
    ctx.fillStyle='#ff9f0a';g._bombs.forEach(b=>{ctx.beginPath();ctx.arc((b.x+.5)*c,(b.y+.5)*c,c*.35,0,Math.PI*2);ctx.fill();});
    ctx.fillStyle='#ff453a';g._explosions.forEach(e=>{ctx.globalAlpha=e.timer/15;ctx.fillRect(e.x*c+2,e.y*c+2,c-4,c-4);});ctx.globalAlpha=1;
    ctx.fillStyle='#0a84ff';ctx.fillRect(g._player.x*c+2,g._player.y*c+2,c-4,c-4);
    ctx.fillStyle='#8e8e93';ctx.font='12px sans-serif';ctx.fillText('Score: '+g._score,4,14);
  }
});

// === 8. Racing (pseudo-3D road) ===
MiniGames.push({
  name:'Road Racer', hint:'L/R to steer, avoid cars', controls:'lr',
  _iv:null,
  init(c){
    const g=this; g._ctx=c.getContext('2d'); g._w=c.width; g._h=c.height;
    g._playerX=0; g._speed=3; g._score=0; g._obstacles=[];
    g._iv=setInterval(()=>g._tick(),25);
  },
  stop(){clearInterval(this._iv);},
  onInput(d){if(d==='left')this._playerX-=0.15;if(d==='right')this._playerX+=0.15;this._playerX=Math.max(-1,Math.min(1,this._playerX));},
  _tick(){
    const g=this; g._score++;
    if(g._score%30===0) g._obstacles.push({x:(Math.random()-0.5)*1.6, z:1});
    g._obstacles.forEach(o=>{o.z-=0.02;});
    g._obstacles=g._obstacles.filter(o=>o.z>0);
    // collision
    for(const o of g._obstacles){
      if(o.z<0.15&&o.z>0.05&&Math.abs(o.x-g._playerX)<0.25){g._score=Math.max(0,g._score-50);o.z=-1;}
    }
    g._draw();
  },
  _draw(){
    const g=this,ctx=g._ctx,w=g._w,h=g._h;
    // sky
    ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,w,h/2);
    // road
    for(let y=h/2;y<h;y++){
      const depth=(y-h/2)/(h/2);
      const roadW=w*0.2+depth*w*0.6;
      const cx=w/2+g._playerX*depth*-60;
      ctx.fillStyle=Math.floor(y/8+g._score*0.1)%2?'#2c2c2e':'#3a3a3c';
      ctx.fillRect(cx-roadW/2,y,roadW,1);
      // road edges
      ctx.fillStyle='#ff453a';
      ctx.fillRect(cx-roadW/2-2,y,3,1);ctx.fillRect(cx+roadW/2,y,3,1);
    }
    // obstacles
    for(const o of g._obstacles){
      if(o.z<=0)continue;
      const scale=1-o.z;
      const sy=h/2+scale*(h/2);
      const sx=w/2+(o.x-g._playerX*scale)*w*0.3;
      const sz=10+scale*25;
      ctx.fillStyle='#ff9f0a';ctx.fillRect(sx-sz/2,sy-sz,sz,sz);
    }
    // player car
    ctx.fillStyle='#0a84ff';ctx.fillRect(w/2-12,h-40,24,30);
    ctx.fillStyle='#64d2ff';ctx.fillRect(w/2-8,h-36,16,12);
    ctx.fillStyle='#8e8e93';ctx.font='12px sans-serif';ctx.fillText('Dist: '+Math.floor(g._score/10),4,16);
  }
});

// === 9. DOOM-style FPS (raycaster) ===
MiniGames.push({
  name:'Mini DOOM', hint:'L/R to turn, Up to move, tap fire to shoot', controls:'dpad_fire',
  _iv:null,
  init(c){
    const g=this; g._ctx=c.getContext('2d'); g._w=c.width; g._h=c.height;
    g._px=2.5;g._py=2.5;g._pa=0;g._score=0;
    g._map=[
      [1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,0,1],
      [1,0,1,0,0,1,0,1],
      [1,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,1],
      [1,0,1,0,0,1,0,1],
      [1,0,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,1]
    ];
    g._enemies=[{x:5.5,y:5.5,alive:true},{x:3.5,y:5.5,alive:true},{x:5.5,y:2.5,alive:true}];
    g._flash=0;
    g._iv=setInterval(()=>g._draw(),33);
  },
  stop(){clearInterval(this._iv);},
  onInput(d){
    const g=this,spd=0.2,rot=0.12;
    if(d==='left')g._pa-=rot;
    if(d==='right')g._pa+=rot;
    if(d==='up'){
      const nx=g._px+Math.cos(g._pa)*spd,ny=g._py+Math.sin(g._pa)*spd;
      if(g._map[Math.floor(ny)][Math.floor(nx)]===0){g._px=nx;g._py=ny;}
    }
    if(d==='down'){
      const nx=g._px-Math.cos(g._pa)*spd,ny=g._py-Math.sin(g._pa)*spd;
      if(g._map[Math.floor(ny)][Math.floor(nx)]===0){g._px=nx;g._py=ny;}
    }
    if(d==='fire'){
      g._flash=5;
      for(const e of g._enemies){
        if(!e.alive)continue;
        const dx=e.x-g._px,dy=e.y-g._py,dist=Math.sqrt(dx*dx+dy*dy);
        const angle=Math.atan2(dy,dx)-g._pa;
        const norm=((angle+Math.PI*3)%(Math.PI*2))-Math.PI;
        if(Math.abs(norm)<0.3&&dist<5){e.alive=false;g._score+=100;}
      }
    }
  },
  _draw(){
    const g=this,ctx=g._ctx,w=g._w,h=g._h;
    ctx.fillStyle='#1c1c1e';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#2c2c2e';ctx.fillRect(0,h/2,w,h/2);
    // raycast
    const fov=Math.PI/3, rays=w/4;
    for(let i=0;i<rays;i++){
      const angle=g._pa-fov/2+fov*i/rays;
      let dist=0;const step=0.05,maxD=8;
      while(dist<maxD){
        dist+=step;
        const mx=Math.floor(g._px+Math.cos(angle)*dist),my=Math.floor(g._py+Math.sin(angle)*dist);
        if(mx<0||my<0||mx>=8||my>=8||g._map[my][mx]===1)break;
      }
      const corrDist=dist*Math.cos(angle-g._pa);
      const wallH=Math.min(h,h/(corrDist+0.01));
      const shade=Math.max(40,200-corrDist*30);
      ctx.fillStyle=`rgb(${shade*0.3},${shade*0.4},${shade*0.6})`;
      ctx.fillRect(i*(w/rays),(h-wallH)/2,w/rays+1,wallH);
    }
    // enemies as sprites
    for(const e of g._enemies){
      if(!e.alive)continue;
      const dx=e.x-g._px,dy=e.y-g._py,dist=Math.sqrt(dx*dx+dy*dy);
      const angle=Math.atan2(dy,dx)-g._pa;
      const norm=((angle+Math.PI*3)%(Math.PI*2))-Math.PI;
      if(Math.abs(norm)<fov/2&&dist<7){
        const sx=w/2+norm/(fov/2)*(w/2);
        const sz=Math.min(h*0.8,h/(dist+0.5));
        ctx.fillStyle='#ff453a';ctx.fillRect(sx-sz/4,(h-sz)/2,sz/2,sz);
      }
    }
    // gun flash
    if(g._flash>0){ctx.fillStyle=`rgba(255,200,0,${g._flash/5})`;ctx.fillRect(w/2-10,h-30,20,20);g._flash--;}
    // crosshair
    ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(w/2-6,h/2);ctx.lineTo(w/2+6,h/2);ctx.moveTo(w/2,h/2-6);ctx.lineTo(w/2,h/2+6);ctx.stroke();
    ctx.fillStyle='#8e8e93';ctx.font='12px sans-serif';ctx.fillText('Score: '+g._score,4,16);
  }
});

// === Game Launcher ===
function startRandomGame() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  const size = Math.min(280, rect.width - 40);
  canvas.width = size; canvas.height = size;

  if (activeGame) activeGame.stop();
  const game = MiniGames[Math.floor(Math.random() * MiniGames.length)];
  activeGame = game;
  game.init(canvas);

  document.getElementById('game-hint').textContent = game.name + ' — ' + game.hint;
  buildControls(game.controls);

  // Touch swipe on canvas
  let touchStart = null;
  canvas.ontouchstart = (e) => { touchStart = {x:e.touches[0].clientX,y:e.touches[0].clientY}; e.preventDefault(); };
  canvas.ontouchend = (e) => {
    if (!touchStart) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) { game.onInput('fire'); }
    else if (Math.abs(dx) > Math.abs(dy)) { game.onInput(dx > 0 ? 'right' : 'left'); }
    else { game.onInput(dy > 0 ? 'down' : 'up'); }
    touchStart = null; e.preventDefault();
  };
}

function stopCurrentGame() {
  if (activeGame) { activeGame.stop(); activeGame = null; }
}

function buildControls(type) {
  const el = document.getElementById('game-controls');
  if (!el) return;
  if (type === 'dpad') {
    el.innerHTML = '<button ontouchstart="gameInput(\'up\')">&#x25B2;</button><div class="row"><button ontouchstart="gameInput(\'left\')">&#x25C0;</button><button ontouchstart="gameInput(\'right\')">&#x25B6;</button></div><button ontouchstart="gameInput(\'down\')">&#x25BC;</button>';
  } else if (type === 'lr') {
    el.innerHTML = '<div class="row"><button ontouchstart="gameInput(\'left\')">&#x25C0;</button><button ontouchstart="gameInput(\'right\')">&#x25B6;</button></div>';
  } else if (type === 'dpad_fire') {
    el.innerHTML = '<button ontouchstart="gameInput(\'up\')">&#x25B2;</button><div class="row"><button ontouchstart="gameInput(\'left\')">&#x25C0;</button><button class="wide" ontouchstart="gameInput(\'fire\')">FIRE</button><button ontouchstart="gameInput(\'right\')">&#x25B6;</button></div><button ontouchstart="gameInput(\'down\')">&#x25BC;</button>';
  } else if (type === 'tap') {
    el.innerHTML = '<button class="wide" ontouchstart="gameInput(\'fire\')">TAP</button>';
  }
}

function gameInput(dir) { if (activeGame) activeGame.onInput(dir); }
