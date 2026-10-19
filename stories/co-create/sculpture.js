/* BECOMING — a parametric sculpture. Native WebGL, no runtime dependencies. */
(() => {
  'use strict';
  const vertex = `
  precision highp float;
  attribute vec2 aUV;
  uniform float uTime, uForm, uEnergy, uAspect, uYaw, uPitch;
  varying vec3 vNormal, vPosition;
  const float PI = 3.14159265359;
  vec3 curve(float u) {
    float w = .06 * uEnergy * sin(uTime*.6 + u*4.);
    vec3 orbit = vec3((1.25+w)*cos(u), (1.25+w)*sin(u), .21*sin(3.*u+uTime*.14*uEnergy));
    vec3 knot = vec3((1.01+.32*cos(3.*u))*cos(2.*u), (1.01+.32*cos(3.*u))*sin(2.*u), .52*sin(3.*u));
    vec3 bloom = vec3((1.1+.26*cos(5.*u))*cos(u), (1.1+.26*cos(5.*u))*sin(u), .35*sin(3.*u));
    return uForm < 1. ? mix(orbit,knot,smoothstep(0.,1.,uForm)) : mix(knot,bloom,smoothstep(1.,2.,uForm));
  }
  vec3 surface(float u, float v) {
    vec3 c = curve(u);
    vec3 t = normalize(curve(u+.003)-curve(u-.003));
    vec3 n = normalize(cross(t,vec3(0.,0.,1.)));
    vec3 b = normalize(cross(t,n));
    float r = .29 + .045*cos(u*3.+uTime*.5)*uEnergy;
    r += .07 * (1.-smoothstep(0.,1.,uForm));
    float twist = .22*sin(u*3.+uTime*.18)*uEnergy;
    return c + (n*cos(v+twist) + b*sin(v+twist)*.86)*r;
  }
  vec3 rotateShape(vec3 p) {
    float a=uPitch, b=uYaw, c=-.42;
    p.yz=mat2(cos(a),-sin(a),sin(a),cos(a))*p.yz;
    p.xz=mat2(cos(b),-sin(b),sin(b),cos(b))*p.xz;
    p.xy=mat2(cos(c),-sin(c),sin(c),cos(c))*p.xy;
    return p;
  }
  void main() {
    float u=aUV.x*PI*2., v=aUV.y*PI*2.;
    vec3 p=surface(u,v);
    vec3 du=surface(u+.002,v)-surface(u-.002,v);
    vec3 dv=surface(u,v+.002)-surface(u,v-.002);
    vNormal=rotateShape(normalize(cross(dv,du)));
    p=rotateShape(p);
    vPosition=p;
    float depth=5.4-p.z;
    float f=3.1;
    gl_Position=vec4(p.x*f/uAspect,p.y*f,depth*1.002-0.2002,depth);
  }`;
  const fragment = `
  precision highp float;
  varying vec3 vNormal, vPosition;
  uniform float uMaterial, uDark;
  vec3 studio(vec3 r) {
    vec3 base=mix(vec3(.12,.13,.15),vec3(.39,.41,.43),smoothstep(-.6,.8,r.y));
    float strip=exp(-pow(abs(r.x+.38)/.19,4.))*smoothstep(-.8,.15,r.y);
    float broad=exp(-pow(abs(r.x-.53)/.38,6.))*smoothstep(-.35,.3,r.z);
    float edge=exp(-pow(abs(r.y+.4)/.065,2.));
    base+=vec3(3.9,3.9,3.8)*strip;
    base+=vec3(2.5,2.6,2.8)*broad;
    base+=vec3(.9,1.05,1.7)*edge*.65;
    base*=1.-.88*exp(-pow(abs(r.y-.06)/.17,4.))*smoothstep(-.7,.4,r.z);
    return base;
  }
  void main() {
    vec3 N=normalize(vNormal);
    if(!gl_FrontFacing) N=-N;
    vec3 V=normalize(vec3(0.,0.,5.4)-vPosition);
    vec3 R=reflect(-V,N);
    vec3 col=studio(R);
    float fr=pow(1.-max(0.,dot(N,V)),3.);
    col*=mix(vec3(.83,.86,.91),vec3(.035,.12,.85),uMaterial);
    col+=vec3(.13,.15,.2)*fr;
    float ao=.82+.18*smoothstep(-.4,1.,vPosition.z);
    col*=ao;
    col=col/(col+vec3(.72));
    col=pow(col,vec3(.4545));
    gl_FragColor=vec4(col,1.);
  }`;
  class Sculpture {
    constructor(canvas, options={}) {
      this.canvas=canvas; this.options=options; this.form=options.form??1; this.targetForm=this.form;
      this.material=0;this.targetMaterial=0;this.yaw=0;this.pitch=.65;this.energy=.5;this.dragX=0;this.dragY=0;
      this.pointerX=0;this.pointerY=0;this.live=true;this.failed=false;
      try {
        this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,powerPreference:'low-power'});
        if(!this.gl)throw new Error('WebGL unavailable');
        this.setup();canvas.parentElement.classList.add('has-webgl');
      } catch(e) { this.fallback(); }
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.fallback();});
      canvas.addEventListener('webglcontextrestored',()=>{try{this.failed=false;this.setup();canvas.parentElement.classList.remove('render-unavailable');canvas.parentElement.classList.add('has-webgl');}catch(e){this.fallback();}});
    }
    fallback(){this.failed=true;this.canvas.parentElement.classList.remove('has-webgl');this.canvas.parentElement.classList.add('render-unavailable');}
    setup() {
      const gl=this.gl;
      const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
      this.program=gl.createProgram();const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
      gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
      const rows=200,cols=32,verts=[],indices=[];
      for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++)verts.push(i/rows,j/cols);
      for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+cols+1;indices.push(a,b,a+1,b,b+1,a+1);}
      this.vertexBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(verts),gl.STATIC_DRAW);
      this.indexBuffer=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);this.count=indices.length;
      gl.useProgram(this.program);const pos=gl.getAttribLocation(this.program,'aUV');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
      this.uniforms={};for(const n of ['uTime','uForm','uEnergy','uAspect','uYaw','uPitch','uMaterial','uDark'])this.uniforms[n]=gl.getUniformLocation(this.program,n);
      gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
    }
    draw(time, instant=false) {
      if(this.failed||!this.live)return;
      const gl=this.gl,r=this.canvas.getBoundingClientRect();if(!r.width||!r.height)return;
      const dpr=Math.min(window.devicePixelRatio||1,window.innerWidth<650?1.35:1.7);
      const w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);
      if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;gl.viewport(0,0,w,h);}
      const mix=instant?1:.065;
      this.form+=(this.targetForm-this.form)*mix;this.material+=(this.targetMaterial-this.material)*mix;
      this.yaw+=(this.pointerX*.22+this.dragX-this.yaw)*(instant?1:.06);this.pitch+=(.65+this.pointerY*.12+this.dragY-this.pitch)*(instant?1:.06);
      gl.useProgram(this.program);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const values={uTime:time,uForm:this.form,uEnergy:this.energy,uAspect:w/h,uYaw:this.yaw+time*.085*this.energy,uPitch:this.pitch,uMaterial:this.material,uDark:this.options.dark?1:0};
      for(const n in values)gl.uniform1f(this.uniforms[n],values[n]);
      gl.drawElements(gl.TRIANGLES,this.count,gl.UNSIGNED_SHORT,0);
    }
  }
  window.Sculpture=Sculpture;
})();
