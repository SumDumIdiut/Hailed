// GLSL sources for the Hailed renderer (WebGL2 / GLSL ES 3.00). No extensions required.

const HEAD = `#version 300 es
precision highp float;
precision highp int;
`;

const NOISE = `
float hash13(vec3 p){ p=fract(p*.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float vn(vec3 x){
  vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),f.x),
                 mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x),
                 mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x),f.y),f.z);
}
const mat3 NM = mat3(0.00,0.80,0.60, -0.80,0.36,-0.48, -0.60,-0.48,0.64);
float fbm(vec3 p, int o){
  float a=.5, s=0.;
  for(int i=0;i<6;i++){ if(i>=o) break; s+=a*vn(p); p=NM*p*2.03+17.; a*=.5; }
  return s/(1.-pow(.5,float(o)));
}
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec3 sat(vec3 c,float s){ float l=dot(c,vec3(.3,.59,.11)); return max(mix(vec3(l),c,s),0.); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
vec3 display(vec3 c){ return pow(aces(c), vec3(1./2.2)); }
`;

const HEAT = `
vec3 heatCol(float h){ h=clamp(h,0.,1.); return vec3(smoothstep(0.,.3,h), smoothstep(.25,.75,h)*.9, smoothstep(.65,1.,h)*.75)*(.25+3.2*h*h); }
`;

export const QUAD_VS = HEAD + `
layout(location=0) in vec2 aPos;
uniform vec2 uCenter;   // ndc
uniform vec2 uHalfNdc;  // ndc half extents
uniform float uHalfPx;  // quad half size in device px
out vec2 vPx;
void main(){
  vPx = aPos*uHalfPx;
  gl_Position = vec4(uCenter + aPos*uHalfNdc, 0., 1.);
}`;

// ---- surface activity particles. Analytic per vertex (no CPU sim), drawn as point sprites in planet-local space so they rotate
// with the planet. PER = particles per vent (5 vents x 480 = 2400 max).
//  kind 1 volcano:  k0 flash | 1..130 lava-fountain column | 131..210 bombs with trails (16 x 5) | 211..390 ash plume (billowing, mushroom cap)
//                   | 391..450 pyroclastic flow
//  kind 2 geyser:   k0 vent spark | 1..170 vapour jet | 171..360 plume cap + falling snow | 361..470 ice crystals
//  kind 3 dust devil: 1..260 spiralling funnel | 261..400 ground swirl
export const PART_PER = 480;
export const PART_VS = HEAD + `
uniform float uTime, uUnit, uExag, uMaxPt; uniform int uKind;
uniform vec3 uVent[5]; uniform vec2 uVentP[5];
uniform vec3 uWind; uniform mat3 uRot; uniform vec2 uCenter, uScale; uniform vec3 uL;
out float vK; out float vT; out float vLit; out float vA; out float vU; out float vS; out float vH; out vec2 vRad;
const int PER=480;
float hh(float n){ return fract(sin(n*127.1+311.7)*43758.5453); }
void main(){
  int id=gl_VertexID; int vi=id/PER; int k=id-vi*PER;
  bool low=uUnit<55. && (k&1)==1 && k>0;
  if(uKind==1){   // draw order: alpha-blended ash + flow first, then the additive fountain/bombs/flash on top
    if(k<180) k=211+k; else if(k<240) k=391+(k-180); else if(k<370) k=1+(k-240); else if(k<450) k=131+(k-370); else if(k==450) k=0; else k=999;
  }
  vec3 v=uVent[vi]; float P=uVentP[vi].x; float a=mod(uTime+uVentP[vi].y,P);
  vec3 t1=normalize(cross(v,vec3(0.,1.,.001))); vec3 t2=cross(v,t1);
  vec3 Lo=uL*uRot;
  float fk=float(k)+float(vi)*517.3+uVentP[vi].y*3.1;
  float h1=hh(fk+1.),h2=hh(fk+2.),h3=hh(fk+3.),h4=hh(fk+4.),h5=hh(fk+5.);
  vec3 pos=v; float sz=0.,al=0.,tp=0.,kind=0.,u=0.,hg=0.;
  vec3 wd=normalize(cross(v,uWind)+vec3(1e-4));
  vec3 dirA=t1*cos(h5*6.28318)+t2*sin(h5*6.28318);
  if(uKind==1){
    float fEnv=smoothstep(0.,.7,a)*(1.-smoothstep(P*.3,P*.4,a))*(.78+.22*sin(a*3.1+float(vi)*2.));
    float pEnv=smoothstep(.4,3.,a)*(1.-smoothstep(P*.55,P*.9,a));
    float cEnv=smoothstep(2.,4.,a)*(1.-smoothstep(P*.42,P*.7,a));
    float bEnv=smoothstep(0.,.7,a)*(1.-smoothstep(P*.34,P*.5,a));
    if(k==0){
      float f=a<1.4?(1.-a/1.4):0.; float gl=fEnv*.85+f*1.3;
      if(gl>.02){ pos=v*1.004; sz=(uUnit*(.05+.07*min(gl,1.5))*uExag)+5.; al=min(gl,1.); kind=2.; }
    } else if(k<=130){
      float Tf=1.7+.9*h1; float ph=mod(a+h1*Tf*3.,Tf)/Tf;
      if(h3<fEnv*1.05){
        float Hm=(.26+.2*fEnv)*(.72+.28*h4);
        hg=4.*Hm*ph*(1.-ph);
        float rho=(.012+.07*ph*ph+.026*ph)*h2;
        pos=normalize(v+(t1*cos(h5*6.28318)+t2*sin(h5*6.28318))*rho)*(1.+hg*uExag+.003);
        u=ph; tp=1.-ph*.72; al=1.;
        sz=max(4.,uUnit*(.05+.03*(1.-ph))*(.7+.6*h4)*(1.+.25*uExag));
      }
    } else if(k<=210){
      int b=(k-131)/5; int s=(k-131)-b*5;
      float g1=hh(float(b)*7.7+float(vi)*13.1+3.),g2=hh(float(b)*3.3+float(vi)*5.9+1.),g3=hh(float(b)*9.1+float(vi)*2.3+7.),g4=hh(float(b)*5.7+float(vi)*17.9+2.),g5=hh(float(b)*1.9+float(vi)*11.3+5.);
      float Tb=2.4+2.4*g1; float ub=mod(a+g2*Tb*4.,Tb)/Tb-float(s)*.024;
      if(ub>0. && g3<bEnv*1.1){
        float Hb=.12+.3*g4; float rg=.06+.24*g5*g1;
        float th=rg*ub; hg=4.*Hb*ub*(1.-ub);
        vec3 dr=t1*cos(g5*37.)+t2*sin(g5*37.);
        pos=normalize(v*cos(th)+dr*sin(th))*(1.+hg*uExag+.003);
        tp=pow(1.-ub,1.2); u=float(s)/5.; al=1.-.16*float(s);
        sz=max(2.2,uUnit*.011*(1.-.12*float(s))*(1.+.2*uExag));
      }
    } else if(k<=390){
      float Lp=13.; float ph=mod(a*.85+h1*Lp*2.,Lp)/Lp;
      if(a>.5 && h3<pEnv*1.15){
        float Hp=(.52+.3*pEnv)*(.9+.2*h4);
        hg=Hp*(1.-exp(-1.8*ph))/(1.-exp(-1.8));
        float capk=smoothstep(.42,.9,ph);
        float rho=(.02+.05*ph)*(.3+h4)+capk*(.1+.2*h2)*(.55+.45*pEnv)*(.3+.7*sqrt(h4));
        float ang=h5*6.28318+ph*1.5;
        vec3 dh=t1*cos(ang)+t2*sin(ang);
        pos=normalize(v+dh*rho+wd*(ph*ph*.07+ph*.01))*(1.+hg*uExag+.004-capk*.05*h2);
        u=ph; tp=exp(-ph*5.)*(.4+.6*fEnv);
        al=smoothstep(.0,.16,ph)*(1.-smoothstep(.72,1.,ph))*clamp(pEnv*1.5,0.,1.)*.85; kind=1.;
        sz=max(4.,uUnit*(.045+.085*ph+.07*capk)*(.65+.7*h2)*(1.+.15*uExag));
      }
    } else if(k<=450){
      float Tp=6.5; float ph=mod(a*.8+h1*Tp*2.,Tp)/Tp;
      if(a>2. && h3<cEnv*1.1){
        float s=.21*(1.-exp(-3.2*ph))*(.45+.55*h4);
        hg=(.004+.012*ph+.008*h2);
        pos=normalize(v*cos(s)+dirA*sin(s))*(1.+hg*uExag);
        u=ph; tp=1.-ph*1.5; kind=3.;
        al=smoothstep(0.,.08,ph)*(1.-smoothstep(.55,1.,ph))*cEnv*.9;
        sz=max(6.,uUnit*(.07+.09*ph)*(.7+.6*h2)*(1.+.15*uExag));
      }
    }
  } else if(uKind==2){
    float env=smoothstep(0.,.8,a)*(1.-smoothstep(6.,10.,a));
    float Hj=.32+.14*h4;
    if(k==0){
      if(env>.03){ pos=v*1.004; sz=uUnit*(.03+.03*env)*uExag+5.; al=env*.9; kind=2.; tp=1.; }
    } else if(k<=170){
      float Tj=2.2; float ph=mod(a*1.1+h1*Tj*3.,Tj)/Tj;
      if(h3<env){
        hg=Hj*(.4+.6*env)*(1.-(1.-ph)*(1.-ph));
        float rho=(.004+.04*pow(ph,1.5))*h2;
        pos=normalize(v+(t1*cos(h5*6.28318)+t2*sin(h5*6.28318))*rho+wd*ph*ph*.02)*(1.+hg*uExag+.003);
        u=ph; kind=1.; tp=1.-ph;
        al=smoothstep(0.,.06,ph)*(1.-smoothstep(.55,1.,ph))*env*.8;
        sz=max(4.,uUnit*(.026+.06*ph)*(.7+.6*h2)*(1.+.2*uExag));
      }
    } else if(k<=360){
      float Tc=7.; float ph=mod(a*.55+h1*Tc*2.,Tc)/Tc;
      if(a>.5 && h3<env*1.1){
        float Hc=Hj*(.8+.4*h4)*(.5+.5*env);
        hg=Hc*(.7+.9*ph*(1.-ph)*2.)*(1.-ph*.85)+.01;
        float rho=(.02+.14*ph)*(.3+.7*h2);
        pos=normalize(v+dirA*rho+wd*(ph*.11+ph*ph*.07))*(1.+hg*uExag+.003);
        u=ph; kind=1.; tp=0.;
        al=smoothstep(0.,.12,ph)*(1.-smoothstep(.5,1.,ph))*env*.6;
        sz=max(4.,uUnit*(.03+.07*ph)*(.7+.6*h2)*(1.+.15*uExag));
      }
    } else if(k<=470){
      float Tk=2.6+1.4*h1; float ph=mod(a+h2*Tk*3.,Tk)/Tk;
      if(h3<env){
        float th=.03*ph*(.4+h4); hg=4.*(Hj*.9)*ph*(1.-ph);
        pos=normalize(v*cos(th)+dirA*sin(th))*(1.+hg*uExag+.003);
        u=ph; tp=1.; kind=0.; al=1.-ph*.6;
        sz=max(2.2,uUnit*.007*(.6+h4)*(1.+.2*uExag));
      }
    }
  } else {
    float env=.55+.45*sin(a*.37+float(vi)*1.9);
    vec3 wp=normalize(wd*.012*a*.2+vec3(1e-5)); // drift direction
    vec3 vd=normalize(v+wd*.03*sin(a*.21+float(vi))+cross(v,wd)*.02*cos(a*.17));
    vec3 s1=normalize(cross(vd,vec3(0.,1.,.001))); vec3 s2=cross(vd,s1);
    float Hd=.2+.07*h4;
    if(k>=1 && k<=260){
      float ph=fract(h1+a*(.12+.05*h3)); 
      hg=Hd*ph*(.85+.3*env);
      float rho=(.008+.062*pow(ph,1.2))*(.75+.5*h2);
      float ang=h5*6.28318+ph*6.+a*(4.-2.5*ph);
      pos=normalize(vd+(s1*cos(ang)+s2*sin(ang))*rho+wd*ph*ph*.03)*(1.+hg*uExag+.002);
      u=ph; kind=1.; al=.8*smoothstep(0.,.08,ph)*(1.-smoothstep(.7,1.,ph))*(.6+.4*env);
      sz=max(3.,uUnit*(.016+.034*ph)*(.7+.6*h2)*(1.+.2*uExag));
    } else if(k<=400){
      float ph=fract(h1+a*.2);
      float rho=(.012+.09*ph)*(.5+.5*h2); float ang=h5*6.28318+a*(5.-3.*ph);
      hg=.004+.012*ph;
      pos=normalize(vd+(s1*cos(ang)+s2*sin(ang))*rho)*(1.+hg*uExag+.002);
      u=ph; kind=1.; al=.5*(1.-ph)*smoothstep(0.,.1,ph)*(.6+.4*env);
      sz=max(3.,uUnit*(.03+.05*ph)*(.7+.6*h2)*(1.+.15*uExag));
    }
  }
  vec3 vv=uRot*pos;
  if(al<=0. || low || (vv.z<0. && length(vv.xy)<1.)){ gl_Position=vec4(2.,2.,2.,1.); gl_PointSize=0.; }
  else { gl_Position=vec4(uCenter+vv.xy*uScale,0.,1.); gl_PointSize=min(sz,uMaxPt); }
  vK=kind; vT=tp; vA=al; vU=u; vS=hh(fk+9.); vH=hg;
  vec3 pn=normalize(pos);
  float ndl=dot(pn,Lo);
  float thr=-sqrt(max(1.-1./((1.+hg)*(1.+hg)),0.));
  vLit=smoothstep(thr-.06,thr+.3,ndl);
  vRad=normalize((uRot*pn).xy+vec2(1e-4));
}`;
export const PART_FS = HEAD + NOISE + HEAT + `
in float vK; in float vT; in float vLit; in float vA; in float vU; in float vS; in float vH; in vec2 vRad;
uniform vec3 uLightCol; uniform vec3 uL; uniform int uKind; uniform float uTime;
out vec4 outc;
void main(){
  vec2 c=gl_PointCoord*2.-1.; float r2=dot(c,c);
  if(r2>1.) discard;
  bool lava=uKind==1, ice=uKind==2;
  if(vK>1.5 && vK<2.5){
    float f=exp(-r2*2.6);
    vec3 fc=ice?vec3(.6,.85,1.):vec3(1.,.72,.3);
    outc=vec4(display(fc*f*f*(ice?2.5:4.5))*vA,0.); return;
  }
  if(vK<.5){
    float f=(exp(-r2*3.)+.18*exp(-r2*1.2)-.2)*1.25; f=max(f,0.)*(1.-r2);
    vec3 col=lava?heatCol(vT)*(.9+1.6*vT)*(.8+.5*vU):ice?vec3(.7,.9,1.)*(.5+1.6*vT)*(.5+.9*step(.5,fract(vS*7.+uTime*(1.5+vS*2.)))):vec3(1.,.8,.5)*.6;
    outc=vec4(display(col*f)*vA*min(f*1.6,1.),0.); return;
  }
  // volumetric puff: billowy noise edge, fake-sphere lighting, lava underglow
  vec3 cp=vec3(c*1.9+vS*17.,vS*5.+uTime*.1+vU*1.5);
  float n=vn(cp)*.6+vn(cp*2.1+4.)*.3+vn(cp*4.3)*.1;
  float edge=r2*1.1+(.5-n)*.75;
  float f=pow(smoothstep(1.,.1,edge),1.5)*smoothstep(1.,.45,r2);
  if(f<=.004) discard;
  vec3 N=normalize(vec3(c.x,-c.y,sqrt(max(1.-r2,.05)))+(vec3(vn(cp+9.),vn(cp+13.),0.)-.5)*.7);
  float lamb=clamp(dot(N,uL)*.6+.42,0.,1.);
  float lit=lamb*vLit;
  vec3 col; float a;
  if(vK>2.5){        // pyroclastic flow: dark grey avalanche with a glowing underside
    col=mix(vec3(.02,.018,.02),vec3(.34,.32,.3)*mix(vec3(1.),uLightCol,.4),lit*.8)+vec3(.012);
    col+=heatCol(clamp(vT,0.,1.))*vT*.55*f*f;
    a=clamp(vA*f*f*.55,0.,1.);
  } else if(lava){   // ash: orange from below, grey above
    col=mix(vec3(.03,.03,.034),vec3(.5,.49,.49)*mix(vec3(1.),uLightCol,.35),lit)+vec3(.01);
    float gl=exp(-vH*5.)*(.4+.6*clamp(dot(N.xy,-vRad)+.55,0.,1.));
    col+=vec3(1.,.4,.09)*gl*(1.4+.9*f)*(1.-.35*lit);
    col*=mix(.7,1.,smoothstep(0.,.55,f));
    a=clamp(vA*f*.9,0.,1.);
  } else if(ice){    // vapour + snow: white-blue
    col=mix(vec3(.12,.17,.27),vec3(.96,.985,1.)*uLightCol,lit)+vec3(.025,.035,.06);
    a=clamp(vA*f*1.1,0.,1.);
  } else {           // sand
    col=mix(vec3(.05,.035,.025),vec3(.86,.66,.42)*uLightCol,lit)+vec3(.02,.014,.01);
    a=clamp(vA*f*1.1,0.,1.);
  }
  outc=vec4(display(col)*a,a);
}`;

export const BG_VS = HEAD + `
layout(location=0) in vec2 aPos;
out vec2 vNdc;
void main(){ vNdc=aPos; gl_Position=vec4(aPos,0.,1.); }`;

export const BG_FS = HEAD + NOISE + `
in vec2 vNdc;
out vec4 outc;
uniform mat3 uViewToWorld;
uniform float uAspect, uTanH, uTime;
uniform vec3 uSeed;
uniform vec3 uTint;
void main(){
  vec3 dir = normalize(uViewToWorld * vec3(vNdc.x*uAspect*uTanH, vNdc.y*uTanH, -1.));
  vec3 col = vec3(.004,.005,.012);
  // nebula
  float n  = fbm(dir*2.1+uSeed, 4);
  float n2 = fbm(dir*3.3+uSeed.zxy+5., 3);
  vec3 cA = mix(vec3(.30,.10,.42), vec3(.08,.20,.45), uTint.x);
  vec3 cB = mix(vec3(.55,.18,.22), vec3(.10,.45,.45), uTint.y);
  float neb = pow(smoothstep(.38,.85,n), 2.2);
  col += neb*mix(cA,cB,n2)*.30;
  // faint galactic band
  vec3 bn = normalize(vec3(.3,1.,.2)+uTint*.4);
  float band = exp(-pow(dot(dir,bn)/.22, 2.));
  col += band*(.015+.04*fbm(dir*6.+uSeed*.3, 3))*vec3(.8,.85,1.);
  // stars, two layers
  for(int L=0; L<3; L++){
    float s = L==0 ? 48. : (L==1 ? 105. : 210.);
    vec3 g = dir*s + uSeed*7.;
    vec3 id = floor(g); vec3 fr = fract(g)-.5;
    float h = hash13(id);
    float thr = L==2 ? .86 : .90;
    if(h>thr){
      vec3 j = vec3(hash13(id+3.1),hash13(id+7.7),hash13(id+11.3))-.5;
      float d = length(fr-j*.7);
      float rad = L==0 ? .10 : (L==1 ? .13 : .16);
      float k = smoothstep(rad,0.,d);
      float mag = pow((h-thr)/(1.-thr), 3.)*(L==0?1.6:(L==1?.9:.55))+.12;
      float tw = .85+.15*sin(uTime*(1.+h*3.)+h*50.);
      float tt = hash13(id+19.);
      vec3 sc = mix(vec3(1.,.72,.5), vec3(.7,.82,1.), tt);
      col += sc*k*k*mag*tw*1.3;
    }
  }
  outc = vec4(clamp(col,0.,1.), 1.);
}`;

export const ORBIT_VS = HEAD + `
layout(location=0) in vec2 aPos;
uniform mat3 uRv; uniform vec3 uEye; uniform float uR, uTanH, uAspect;
void main(){
  vec3 w = vec3(aPos.x, 0., aPos.y)*uR;
  vec3 v = uRv*(w-uEye);
  float n=.05, f=2000.;
  gl_Position = vec4(v.x/(uTanH*uAspect), v.y/uTanH, -(f+n)/(f-n)*v.z - 2.*f*n/(f-n), -v.z);
}`;
export const ORBIT_FS = HEAD + `
uniform vec4 uColor; out vec4 outc;
void main(){ outc = vec4(uColor.rgb*uColor.a, uColor.a); }`;


// Petrova line: a soft additive ribbon (built on the CPU as a screen-space strip).
export const RIB_VS = HEAD + `
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aUV;
out vec2 vUV;
void main(){ vUV=aUV; gl_Position=vec4(aPos,0.,1.); }`;
export const RIB_FS = HEAD + NOISE + `
in vec2 vUV;
out vec4 outc;
uniform float uTime, uInf, uLen, uSeed;
void main(){
  float u=vUV.x, s=vUV.y;
  float core=exp(-s*s*16.), halo=exp(-s*s*3.4);
  float fl=vn(vec3(u*uLen*.9-uTime*.7, s*2.5, uSeed));
  float fl2=vn(vec3(u*uLen*2.4-uTime*1.3, s*5.+3., uSeed+4.));
  float streak=.4+.55*fl+.45*fl2;
  float pk=pow(.5+.5*sin(u*uLen*1.2-uTime*1.8+fl*4.),3.);
  float sp=0.;
  for(int L=0;L<3;L++){
    float fL=float(L);
    vec2 g=vec2(u*uLen*(4.+2.*fL)-uTime*(1.4+.8*fL)+fL*9., s*4.+fl*6.+fL*3.);
    vec2 id=floor(g);
    float h=hash12(id+uSeed+fL*13.);
    if(h>.80){
      vec2 j=vec2(hash12(id+3.3),hash12(id+8.8))-.5;
      float d=length((fract(g)-.5-j*.5)*vec2(.55,1.));
      sp+=smoothstep(.24,0.,d)*(.5+.5*sin(uTime*6.+h*40.));
    }
  }
  float env=smoothstep(0.,.1,u)*smoothstep(1.,.86,u);
  vec3 c=vec3(.7,.06,.025)*halo*.55*streak + vec3(1.,.3,.1)*core*(.45+.95*pk)*streak + vec3(1.,.55,.3)*sp*.95*halo;
  outc=vec4(c*uInf*env,0.);
}`;

// Screen-space triangle batches: ship mesh, trails, tether, glows. Vertex = pos ndc (2), uv + kind (3), premultiplied colour (4).
// kind 0 flat, 1 round glow (uv in -1..1), 2 soft line edge (uv.y in -1..1). alpha 0 in the colour gives additive blending.
export const TRI_VS = HEAD + `
layout(location=0) in vec2 aPos;
layout(location=1) in vec3 aUV;
layout(location=2) in vec4 aCol;
out vec3 vUV; out vec4 vCol;
void main(){ vUV=aUV; vCol=aCol; gl_Position=vec4(aPos,0.,1.); }`;
export const TRI_FS = HEAD + `
in vec3 vUV; in vec4 vCol; out vec4 outc;
void main(){
  float f=1.;
  if(vUV.z>.5 && vUV.z<1.5){ float d=dot(vUV.xy,vUV.xy); f=exp(-d*3.5)*(1.-smoothstep(.7,1.,d)); }
  else if(vUV.z>=1.5){ float d=abs(vUV.y); f=1.-smoothstep(.25,1.,d); }
  outc=vCol*f;
}`;

export const BODY_FS = HEAD + NOISE + `
in vec2 vPx;
out vec4 outc;
uniform int uMode;      // 0 planet, 1 star, 2 selection ring, 3 lens flare (full screen)
uniform float uUnit;    // device px per body radius
uniform float uTime;
uniform int uType;      // 0 rocky 1 ocean 2 ice 3 lava 4 gas 5 desert
uniform int uSpecial;   // 0 none 1 earth 2 erid 3 adrian
uniform vec3 uOff;
uniform mat3 uRot;      // object -> view
uniform vec3 uL;        // view-space dir to star
uniform vec3 uLightCol;
uniform vec3 uPal[5];
uniform int uNPal;
uniform vec3 uAtmoCol;
uniform float uAtmoDen;
uniform vec4 uRing;     // inner outer opacity has
uniform vec3 uRingCol;
uniform vec3 uStarCol;
uniform float uInfect;
uniform vec4 uScan;     // enabled, sweep start longitude, coverage 0..1, footprint half angle
uniform vec3 uScanSub;  // view-space unit dir to the point under the ship
uniform vec3 uScanCol;
uniform vec4 uMark;     // object-space dir (xyz) + angular radius of the hotspot marker (w, 0 = off)
uniform float uQuad;    // quad half size in radii
uniform vec2 uFlarePos; // device px, y up
uniform vec2 uRes;
uniform vec3 uFlareCol;
uniform float uFlareR, uFlareStr;

uniform float uDbg, uCamD;
float gUE;
int gOct = 5;
float gAD; vec3 gAC;
vec3 sAlb; float sWater, sGloss, sBump, sScale, sH, sLand, sCoast;
vec3 sEmis, sLights;
float sDepth=0., gFoam=0., sSpark=0., sSand=0.;

// ---- surface activity: volcanoes (kind 1), cryo-geysers (kind 2), cyclones, ocean waves ----
uniform int uVolcN, uVolcKind;
uniform vec3 uVent[5]; uniform vec2 uVentP[5];
vec3 gPyro; float gVShade;
${HEAT}
float ventPulse(int i){
  float a=mod(uTime+uVentP[i].y,uVentP[i].x);
  return smoothstep(0.,.5,a)*(1.-smoothstep(5.5,10.,a)) + (a<.7?2.*(1.-a/.7):0.);
}
void volcanoGround(vec3 qo, vec3 Lo){
  float vm=max(1.,9./uUnit);
  for(int i=0;i<5;i++){
    if(i>=uVolcN) break;
    vec3 v=uVent[i]; float P=uVentP[i].x;
    float a=mod(uTime+uVentP[i].y,P);
    float dc=length(qo-v);
    float dm=dc/vm;
    if(uVolcKind==2){
      float env=smoothstep(0.,.8,a)*(1.-smoothstep(6.,10.,a));
      sAlb=mix(sAlb,vec3(.97,.99,1.),exp(-dm/.045)*(.5+.3*env));
      sAlb*=1.-.3*exp(-dm*dm/.0001);
      sEmis+=vec3(.25,.5,.9)*exp(-dm*dm/.00012)*env*.25;
      continue;
    }
    float env=smoothstep(0.,.5,a)*(1.-smoothstep(5.5,10.,a));
    float fl=a<.7?(1.-a/.7):0.;
    float cone=exp(-dm*dm/.0016);
    sAlb*=1.-.55*cone;
    vec3 t1=normalize(cross(v,vec3(0.,1.,.001))); vec3 t2=cross(v,t1);
    float ang=atan(dot(qo,t2),dot(qo,t1));
    float tend=vn(vec3(cos(ang),sin(ang),float(i)*3.7)*2.3+uOff);
    float grow=1.-exp(-a*.22);
    float rf=(.012+.115*grow)*vm*(.4+1.35*tend);
    float wob=(vn(qo*34.+uOff)-.5)*.02*vm;
    float fm=(1.-smoothstep(rf*.7,rf,dc+wob))*(1.-smoothstep(P-4.,P,a));
    float heat=exp(-a/(P*.3))*(1.-.55*clamp(dc/max(rf,.001),0.,1.));
    sAlb*=1.-.7*fm*(1.-heat);
    sEmis+=heatCol(heat)*fm*heat*2.8;
    sEmis+=heatCol(.92)*exp(-dm*dm/.00005)*(.4+3.*env);
    sEmis+=vec3(1.,.9,.6)*exp(-dm/.03)*fl*fl*6.;
    gPyro+=(vec3(1.,.38,.08)*(env+fl*2.)+vec3(.8,.2,.03)*.25*fm*heat)*exp(-dc*dc/(.06*vm));
    // ash plume shadow, thrown away from the sun
    float pd=smoothstep(.3,3.,a)*(1.-smoothstep(10.,22.,a));
    float nl=dot(v,Lo);
    if(nl>.05 && pd>.01){
      vec3 sd=Lo-v*nl; sd=-normalize(sd+vec3(1e-4));
      float off=clamp(.2*pd*sqrt(max(1.-nl*nl,0.))/max(nl,.2),0.,.45);
      float ds=length(qo-normalize(v+sd*off));
      gVShade=max(gVShade,pd*.75*(1.-smoothstep(.02,.07+.05*pd,ds)));
    }
  }
}
vec3 cycC(int j){
  float fj=float(j);
  float y=(.32+.26*fract(uOff.x*.37+fj*.41))*(j==0?1.:-1.);
  float lo=6.28318*fract(uOff.y*.29+fj*.53);
  float cr=sqrt(1.-y*y);
  return vec3(cr*cos(lo),y,cr*sin(lo));
}
float gCyc=0.;   // spiral-arm strength of the strongest cyclone here (cloud relief)
// crisp logarithmic-spiral cyclone with a clear eye; returns cloud density, storm = soft footprint
float cyc(vec3 q,int j,out float storm){
  float y=cycC(j).y;
  vec3 c=cycC(j);
  storm=0.;
  if(dot(q,c)<.55) return 0.;
  vec3 t1=normalize(cross(c,vec3(0.,1.,.001))); vec3 t2=cross(c,t1);
  vec2 l=vec2(dot(q,t1),dot(q,t2)); float d=length(l);
  float R=.42;
  storm=1.-smoothstep(.04,R*1.1,d);
  float hem=y>0.?1.:-1.;
  float a=atan(l.y,l.x)*hem;
  float rn=vn(vec3(l*9.,uOff.z))-.5;
  float sp=a*3.+11.*log(1.+d*16.)-uTime*.1+rn*1.1*smoothstep(.05,.3,d);
  float band=.5+.5*sin(sp);
  float arm=smoothstep(.45,.7,band);
  float env=1.-smoothstep(.2,R,d);
  float eye=smoothstep(.018,.034,d);
  float wall=exp(-pow((d-.052)/.02,2.))*.8;
  float tex=.75+.5*vn(vec3(l*60.,uOff.y+uTime*.02));
  float dens=(env*(.05+.9*arm)*tex+wall*tex)*eye;
  gCyc=max(gCyc,arm*env);
  return clamp(dens*1.2,0.,.95);
}
// lightning: bursts on the visible night side, a few every few seconds, cloud-lit, with occasional branching bolts
float gBolt;
float boltLine(vec2 l,float seed,float len){
  float t=l.y/len; if(t<0.||t>1.) return 0.;
  float jx=(vn(vec3(l.y*28.,seed,1.))-.5)*.07*(.4+t)+(vn(vec3(l.y*85.,seed+3.,2.))-.5)*.02;
  float d=abs(l.x-jx);
  return exp(-d*d/2.5e-5)+.3*exp(-d*d/4.5e-4);
}
float flashGlow(vec3 qo,vec3 Lo,vec3 Vo){
  float g=0.; gBolt=0.;
  vec3 e1=Vo-Lo*dot(Vo,Lo); float el=length(e1); e1=el>.03?e1/el:normalize(cross(Lo,vec3(0.,1.,.001)));
  vec3 e2=cross(Lo,e1);
  for(int i=0;i<3;i++){
    float fi=float(i);
    float T=1.9+fi*.85+(uType==4?.4:0.);
    float tt=uTime+fi*1.37;
    float n=floor(tt/T), f=tt-n*T;
    float h5=hash13(vec3(n,fi+14.,uOff.x+3.));
    float env=exp(-f*6.5)*(.55+.45*step(0.,sin(f*75.)))+exp(-max(f-.2,0.)*8.)*step(.2,f)*.85*step(.45,h5);
    if(uDbg>.5) env=1.;
    if(env<.03) continue;
    vec3 h=vec3(hash13(vec3(n,fi,uOff.x)),hash13(vec3(n,fi+5.,uOff.y)),hash13(vec3(n,fi+9.,uOff.z)));
    vec3 c=normalize(-Lo*(.08+.7*h.x)+e1*(.25+.75*h.y)+e2*(h.z*2.-1.)*.9);
    vec3 dq=qo-c;
    float rad=uType==4?.007:.0032;
    g+=exp(-dot(dq,dq)/rad)*env;
    // sub-flashes nearby (cloud cluster)
    vec3 c2=normalize(c+(vec3(h.y,h.z,h.x)-.5)*.35);
    vec3 d2=qo-c2; g+=exp(-dot(d2,d2)/(rad*.55))*env*.7*step(.35,h5);
    if(uUnit>40. && (h.x>.3||uDbg>.5) && dot(qo,c)>.9){
      vec3 t1=normalize(cross(c,vec3(0.,1.,.001))); vec3 t2=cross(c,t1);
      vec2 l=vec2(dot(qo,t1),dot(qo,t2));
      float ang=h.z*6.28318; vec2 lr=mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*l;
      float len=.2+.14*h.y;
      float b=boltLine(lr,h.y*50.+n,len);
      float y0=len*(.35+.3*h.x);
      float ba=.7*(h.y>.5?1.:-1.); vec2 lb=mat2(cos(ba),-sin(ba),sin(ba),cos(ba))*(lr-vec2(0.,y0));
      b+=.8*boltLine(lb,h.x*40.+n,len*.55)*step(.4,h5);
      gBolt+=b*env*step(.0,f)*(uDbg>.5?1.:1.-smoothstep(.1,.22,f));
    }
  }
  return g;
}
float dustAt(vec3 q){
  vec3 wd=normalize(vec3(sin(uOff.x*1.7),.2,cos(uOff.y*2.1)));
  float nz=fbm(q*4.+uOff+vec3(0.,uTime*.01,0.),3);
  float fr=fract(dot(q,wd)*.9-uTime*.03+uOff.z+(nz-.5)*.12);
  float env=smoothstep(0.,.02,fr)*(1.-smoothstep(.05,.3,fr));
  float m=smoothstep(.42,.62,vn(q*1.7+uOff*.3+3.));
  return clamp(env*smoothstep(.3,.7,nz+.15*env)*m*1.6,0.,.9);
}
// meteor impacts on rocky worlds: flash, expanding ejecta ring, crater that glows then cools
void impactFx(vec3 qo){
  float vm=max(1.,9./uUnit);
  for(int i=0;i<3;i++){
    float fi=float(i);
    float P=19.+fi*5.5;
    float tt=uTime+fi*7.3;
    float n=floor(tt/P), a=tt-n*P;
    vec3 h=vec3(hash13(vec3(n,fi,uOff.x+1.)),hash13(vec3(n,fi+4.,uOff.y+1.)),hash13(vec3(n,fi+8.,uOff.z+1.)));
    vec3 c=normalize(h-.5+vec3(1e-3));
    float dm=length(qo-c)/vm;
    float life=1.-smoothstep(P-3.,P,a);
    float R=.012+.06*(1.-exp(-a*1.1));
    float ring=exp(-pow((dm-R)/(.006+.01*a*.1),2.))*exp(-a*.35);
    float blanket=exp(-dm*dm/(R*R*5.+1e-5))*smoothstep(0.,.5,a)*.35;
    float crater=exp(-dm*dm/.00018);
    float heat=exp(-a/5.);
    float fl=a<.5?(1.-a/.5):0.;
    sAlb*=1.-(.3*blanket+.5*crater*smoothstep(.1,.6,a))*life;
    sEmis+=(heatCol(heat*.9)*crater*heat*2.5*smoothstep(0.,.3,a)+heatCol(.6*heat+.1)*ring*2.)*life;
    sEmis+=vec3(1.,.9,.7)*exp(-dm/.05)*fl*fl*10.;
  }
  if(uUnit>40.){   // rockslide dust puffs on steep high ground
    vec3 sp=qo*7.+uOff; vec3 id=floor(sp);
    float tt=uTime/6.+hash13(id)*10.;
    float n=floor(tt), f=(tt-n)*6.;
    if(hash13(id+n*1.37)>.94 && sH>.5){
      vec3 ctr=id+.3+.4*vec3(hash13(id+3.),hash13(id+7.),hash13(id+11.));
      float dd=length(sp-ctr)/(.15+.08*f);
      float puff=exp(-dd*dd*3.)*exp(-f*.5)*smoothstep(0.,.3,f);
      sAlb=mix(sAlb,vec3(.6,.5,.4),puff*.6);
    }
  }
}
vec3 oceanFx(vec3 qo, vec3 Nb, float ndlg){
  float fadeW=smoothstep(14.,60.,uUnit);
  float fadeS=smoothstep(40.,130.,uUnit);
  float s0,s1; cyc(qo,0,s0); cyc(qo,1,s1);
  float stm=max(s0,s1);
  float sea=.8+.8*stm;
  vec3 g=vec3(0.); float hs=0.;
  float ph0=vn(qo*6.+uOff)*5.;
  for(int i=0;i<6;i++){
    float fi=float(i);
    float fr=26.*pow(1.62,fi);
    vec3 D=normalize(vec3(sin(fi*2.399+uOff.x),cos(fi*1.7+uOff.y)*.7,sin(fi*3.1+uOff.z+1.)));
    float ph=dot(qo,D)*fr-uTime*.33*sqrt(fr)+ph0*(1.+fi*.3);
    float sl=cos(ph)+.35*cos(2.*ph+1.);
    float aa=smoothstep(2.5,7.,uUnit*6.283/fr);
    vec3 Dt=D-qo*dot(D,qo);
    g+=Dt*(sl*.15*aa*pow(.87,fi)); hs+=cos(ph)*aa*pow(.8,fi);
  }
  // fine sparkling ripples that only the sun glint picks out
  float spk=smoothstep(180.,420.,uUnit);
  if(spk>0.){
    vec3 sp3=vec3(vn(qo*480.+vec3(uTime*.8,0.,0.)),vn(qo*480.+vec3(5.,uTime*.65,0.)),vn(qo*480.+vec3(0.,9.,uTime*.7)))-.5;
    g+=(sp3-qo*dot(sp3,qo))*.5*spk;
  }
  float tm=1.+1.8*smoothstep(.4,-.05,ndlg);      // swell relief is strongest at grazing light (the terminator)
  vec3 Nn=normalize(Nb+g*sea*fadeW*sWater*tm);
  float wc=stm*smoothstep(.55,.9,vn(qo*vec3(90.,90.,110.)+vec3(uTime*.3,0.,0.))*.6+vn(qo*vec3(170.,170.,200.)-uTime*.4)*.4)*fadeS*.5;
  float dp=sDepth;
  float swell=.5+.5*sin(uTime*.8+dp*14.);
  float shore=1.-smoothstep(0.,.08,dp);
  float lines=smoothstep(.55,.9,.5+.5*sin(dp*90.-uTime*1.3+vn(qo*60.)*3.));
  float surf=(shore*lines*(.4+.6*swell)+(1.-smoothstep(0.,.006+.004*swell,dp))*.9)*step(-.003,dp)*fadeS;
  gFoam=clamp(max(wc,surf),0.,1.)*sWater;
  vec2 e=normalize(qo.xz+vec2(1e-4));
  vec3 sn=vec3(e*3.+vec2(-e.y,e.x)*uTime*.05,qo.y*70.);
  float st=vn(sn)*.6+vn(sn*vec3(2.1,2.1,2.3)+4.)*.4;
  sAlb*=1.+.3*hs*fadeW*sWater*(.6+stm)+(st-.5)*.22*fadeS*sWater*(.5+stm);
  sGloss*=(.8+.4*st);
  sAlb=mix(sAlb,vec3(.9,.94,.97),gFoam*.85);
  sGloss*=1.-gFoam*.9;
  return Nn;
}

vec3 pal(float t){
  t = clamp(t,0.,.999)*float(uNPal-1);
  int i = int(floor(t));
  return mix(uPal[i], uPal[min(i+1,4)], smoothstep(0.,1.,fract(t)));
}
// cheap crater field: nearest 2x2x2 cells
float craters(vec3 p){
  vec3 i=floor(p), f=fract(p);
  vec3 b=i-1.+step(.5,f);
  float h=0.;
  for(int a=0;a<2;a++) for(int bb=0;bb<2;bb++) for(int c=0;c<2;c++){
    vec3 cell=b+vec3(float(a),float(bb),float(c));
    float hh=hash13(cell+.5);
    if(hh<.4) continue;
    vec3 ctr=cell+.2+.6*vec3(hash13(cell+3.1),hash13(cell+7.7),hash13(cell+11.3));
    float rad=.16+.3*hash13(cell+19.);
    float x=length(p-ctr)/rad;
    h+=(x<1.? -(1.-x*x)*.6 : 0.)+exp(-pow((x-1.)/.16,2.))*.32;
  }
  return h;
}
float terrainH(vec3 q, float sc){
  vec3 p = q*sc+uOff;
  vec3 w = vec3(vn(p*1.7+3.1),vn(p*1.7+7.7),vn(p*1.7+11.3))-.5;
  float wk=gOct>5?.7:(gOct>4?.85:1.);
  float h = fbm(p+w*1.2*wk, gOct);
  float r = 1.-abs(fbm(p*1.4+w*.9*wk+5., gOct>3?gOct-1:gOct)*2.-1.); r*=r;
  float m = smoothstep(.4,.65,vn(p*.45+2.));
  h = mix(h, h*.55+r*.5, m*.85);
  if(uType==0 || uType==2) h += craters(q*4.5+uOff)*(uType==0?.1:.04);
  return h;
}

void surfRocky(vec3 q){
  sScale=1.8; float h=terrainH(q,sScale); sH=h;
  float det=fbm(q*14.+uOff,3);
  float t=smoothstep(.25,.8,h*.85+det*.25);
  vec3 base=sat(pal(t),1.4);
  float mn=fbm(q*2.6+uOff*.7+4.,3);
  base=mix(base,vec3(.66,.33,.17),smoothstep(.48,.7,mn)*.6);
  base=mix(base,vec3(.72,.58,.33),smoothstep(.55,.75,fbm(q*5.+uOff,2))*.3*(1.-smoothstep(.4,.6,h)));
  base=mix(base,vec3(.08,.075,.09),smoothstep(.42,.26,h)*.75);
  base*=.8+.45*det;
  base+=smoothstep(.66,.9,h)*.1;
  float ice=smoothstep(.78,.92,abs(q.y)+(h-.5)*.35+(det-.5)*.1);
  sAlb=mix(base,vec3(.92,.95,1.),ice);
  sGloss=ice*.3; sBump=1.15*(1.-ice*.6);
}
void surfDesert(vec3 q){
  sScale=1.5; float h=terrainH(q,sScale); sH=h;
  float dn=fbm(q*9.+uOff,2);
  float dune=.5+.5*sin(h*38.+dn*6.);
  float t=smoothstep(.25,.78,h);
  vec3 base=sat(mix(pal(t),pal(t*.6+.3),dune*.5),1.3)*(.85+.3*dune);
  base=mix(base,uPal[4]*.6,smoothstep(.38,.2,h)*.7);
  base=mix(base,vec3(.95,.78,.5),smoothstep(.64,.8,h)*.4);
  float ice=smoothstep(.9,.96,abs(q.y)+(h-.5)*.2);
  sAlb=mix(base,vec3(.92,.93,.95),ice);
  if(uUnit>30.){   // wind-blown sand streaming along the wind, in windy regions
    vec3 wd=normalize(vec3(sin(uOff.x*1.7),.2,cos(uOff.y*2.1)));
    vec3 b1=normalize(cross(wd,vec3(0.,1.,.001))); vec3 b2=cross(wd,b1);
    float ws=smoothstep(.3,.65,vn(q*2.2+uOff*.5));
    float x=dot(q,wd)*20.-uTime*.6*(.6+.8*vn(q*9.+uOff));
    float fz=uUnit>200.?300.:170.;
    float stp=vn(vec3(x,dot(q,b1)*fz,dot(q,b2)*fz))*.65+vn(vec3(x*2.3+3.,dot(q,b1)*fz*2.3,dot(q,b2)*fz*2.3))*.35;
    sSand=smoothstep(.55,.88,stp)*ws*(.45+.55*dune)*smoothstep(30.,90.,uUnit);
    sAlb=mix(sAlb,vec3(1.,.84,.58),sSand*.55);
  }
  sBump=1.0;
}
void surfOcean(vec3 q){
  float sea = uSpecial==1 ? .50 : .60;
  sScale=1.35; float h=terrainH(q,sScale); sH=h;
  float depth=sea-h; sDepth=depth;
  float water=smoothstep(-.003,.01,depth);
  vec3 shallow=mix(uPal[1]*1.5,vec3(.12,.62,.58),.45);
  vec3 wc=mix(shallow,uPal[0],smoothstep(0.,.2,depth));
  float lat=abs(q.y);
  float moist=fbm(q*3.+uOff*.5+9.,3);
  vec3 L;
  float e=h-sea;
  if(uSpecial==1){
    vec3 grass=vec3(.16,.36,.09), forest=vec3(.04,.19,.06), dry=vec3(.66,.52,.28), rock=vec3(.4,.34,.3), tundra=vec3(.45,.5,.4);
    L=mix(grass,forest,smoothstep(.4,.65,moist));
    float arid=smoothstep(.45,.58,moist)*smoothstep(.1,.26,lat)*(1.-smoothstep(.4,.56,lat));
    L=mix(L,dry,arid);
    L=mix(L,tundra,smoothstep(.55,.75,lat));
    L=mix(L,rock,smoothstep(.1,.24,e));
  } else {
    L=mix(uPal[2],uPal[3],smoothstep(0.,.18,e));
    L=mix(L,uPal[4],smoothstep(.16,.3,e));
    L=sat(mix(L,L*.8+vec3(.15,.12,.05),moist*.4),1.2);
  }
  L*=.85+.3*fbm(q*22.+uOff,2);
  L=mix(vec3(.78,.7,.46)*.9+L*.2, L, smoothstep(0.,.025,e));
  L=mix(L,vec3(.95,.97,1.),smoothstep(.2,.32,e)*.8);
  float cap=smoothstep(.8,.88,lat+(fbm(q*5.+uOff,3)-.5)*.18);
  sAlb=mix(L,wc,water);
  sAlb=mix(sAlb,vec3(.95,.97,1.),cap);
  sWater=water*(1.-cap);
  sLand=(1.-water)*(1.-cap);
  sCoast=(1.-smoothstep(0.,.1,e))*step(0.,e)*(1.-cap);
  sGloss=sWater; sBump=.7*(1.-water)*(1.-cap);
}
void surfIce(vec3 q){
  sScale=2.; float h=terrainH(q,sScale); sH=h;
  vec3 p=q*3.+uOff; vec3 wp=vec3(vn(p*2.),vn(p*2.+5.),vn(p*2.+9.))-.5;
  float c1=abs(fbm(p+wp*1.4,3)*2.-1.);
  float c2=abs(fbm(p*2.7+wp+4.,2)*2.-1.);
  float wid=.11+.1*vn(p*1.3+9.);
  float crack=clamp((1.-smoothstep(0.,wid,c1))+(1.-smoothstep(0.,.07,c2))*.75,0.,1.);
  float core=1.-smoothstep(0.,wid*.45,c1);
  vec3 base=mix(uPal[0]*.85,uPal[0]*1.08,h)*(.9+.2*fbm(q*20.+uOff,2));
  base=mix(base,uPal[2],smoothstep(.4,.75,fbm(q*2.+uOff,3))*.35);
  base=mix(base,vec3(.97,.99,1.),smoothstep(.6,.8,fbm(q*7.+uOff*2.,3))*.5);
  vec3 edge=uPal[1]*1.5+vec3(.05,.3,.5);
  vec3 deep=uPal[1]*.5+vec3(0.,.04,.16);
  sAlb=mix(base,mix(edge,deep,core*.85),crack*.95);
  sGloss=.55*(1.-crack)+.7*core*(.5+.5*sin(uTime*.7+c1*40.))*step(30.,uUnit)+.6*pow(vn(q*90.+uTime*.5),5.)*crack; sBump=.7;
  sSpark=smoothstep(30.,90.,uUnit)*(crack*pow(vn(q*170.+vec3(0.,0.,uTime*.4)),6.)*9.+core*pow(vn(q*70.+vec3(uTime*.15,0.,0.)),4.)*1.8);
  sAlb=mix(sAlb,vec3(.9,.97,1.),core*.35);
}
void surfLava(vec3 q){
  sScale=2.; float h=terrainH(q,sScale); sH=h;
  vec3 p=q*2.6+uOff; vec3 wp=vec3(vn(p*2.),vn(p*2.+5.),vn(p*2.+9.))-.5;
  float f=fbm(p+wp*1.3+vec3(0.,0.,uTime*.01),4);
  float c=abs(f*2.-1.);
  float crack=1.-smoothstep(0.,.04+.03*vn(p*2.),c);
  float glow=exp(-c/.05);
  float plate=fbm(q*6.+uOff,3);
  vec3 crust=mix(vec3(.045,.04,.048),vec3(.22,.13,.1),plate);
  crust=mix(crust,vec3(.34,.16,.07),smoothstep(.55,.75,fbm(q*3.+uOff,3))*.65);
  crust*=.55+.95*h;
  crust+=smoothstep(.65,.85,h)*vec3(.11,.085,.075);
  crust+=uPal[1]*.15*fbm(q*9.+uOff,3);
  float heat=crack*(.75+.25*sin(uTime*1.3+f*30.));
  float lake=1.-smoothstep(.27,.32,h);
  heat=max(heat,lake*.9);
  vec3 hot=mix(uPal[2],vec3(1.,.85,.35),heat*heat);
  sEmis=hot*(heat*2.2+glow*.3*(.7+.3*sin(uTime*.9+f*20.)));
  sAlb=crust*(1.-heat*.8)*(1.+glow*vec3(1.1,.35,.06));
  sEmis+=crust*vec3(.9,.38,.16)*.22*(1.-heat);   // crust lit from below by the magma
  sBump=.9;
  if(uVolcKind==1){   // brighter, moving lava rivers running down from each vent
    float rvs=0.,rvp=0.;
    for(int i=0;i<5;i++){
      if(i>=uVolcN) break;
      vec3 vt=uVent[i]; float dc=acos(clamp(dot(q,vt),-1.,1.));
      if(dc>.85) continue;
      vec3 t1=normalize(cross(vt,vec3(0.,1.,.001))); vec3 t2=cross(vt,t1);
      vec2 l=vec2(dot(q,t1),dot(q,t2)); float an=atan(l.y,l.x);
      float mea=vn(vec3(l*3.5,float(i)*4.1+uOff.x))*3.;
      float lane=abs(vn(vec3(cos(an)*2.5,sin(an)*2.5,dc*3.4+mea))*2.-1.);
      float w=.028+.03*smoothstep(0.,.5,dc);
      float riv=(1.-smoothstep(0.,w,lane))*(1.-smoothstep(.1,.8,dc))*smoothstep(.012,.05,dc);
      float pu=pow(.5+.5*sin(dc*62.-uTime*2.4+mea*5.),2.);
      rvs=max(rvs,riv); rvp=max(rvp,riv*pu);
    }
    sAlb*=1.-.6*rvs;
    sEmis+=mix(vec3(1.,.42,.07),vec3(1.,.88,.4),rvp)*(rvs*.8+rvp*1.8);
  }
}
void surfGas(vec3 q){
  float lat=q.y;
  float la=asin(clamp(lat,-1.,1.));
  float shear=sin(lat*9.+uOff.z)*.5+sin(lat*21.+uOff.x)*.25;
  float a=uTime*.04*(1.+shear*.6);
  vec3 qr=vec3(cos(a)*q.x+sin(a)*q.z, q.y, -sin(a)*q.x+cos(a)*q.z);
  float turb=fbm(vec3(qr.x*2.4,qr.y*20.,qr.z*2.4)+uOff,4);
  float turb2=fbm(qr*6.+uOff+3.,3);
  float band=.5+.5*sin(lat*11.+(turb-.5)*(4.+3.*abs(shear))+uOff.z);
  float band2=.5+.5*sin(lat*27.+uOff.y+turb*3.);
  float t=clamp(band*.68+band2*.2+(turb2-.5)*.55+.05,0.,1.);
  vec3 gc=sat(pal(t),1.25);
  gc*=mix(vec3(1.06,.95,.9),vec3(.9,.97,1.06),band2);
  float fil=fbm(vec3(qr.x*1.2,qr.y*60.,qr.z*1.2)+uOff*2.,2);
  gc*=.88+.3*fil;
  float lon=atan(qr.z,qr.x);
  for(int i=0;i<4;i++){
    float fi=float(i);
    float h1=fract(uOff.x*.131+fi*.37), h2=fract(uOff.y*.173+fi*.61), h3=fract(uOff.z*.211+fi*.53);
    float lat0=(h1-.5)*(i==0?.6:1.5)-(i==0?.15:0.);
    float lon0=h2*6.28318-3.14159+uTime*.006*(1.+fi*.7);
    float size=i==0?1.:(.3+.3*h3);
    float dl=mod(lon-lon0+3.14159,6.28318)-3.14159;
    vec2 d=vec2(dl*cos(lat0)/(.55*size),(la-lat0)/(.26*size));
    float e=length(d);
    if(e<1.5){
      float m=1.-smoothstep(.7,1.,e);
      float sw=(1.-clamp(e,0.,1.)); sw=sw*sw*6.+uTime*.35*(i==0?1.:-1.);
      vec2 dd=mat2(cos(sw),sin(sw),-sin(sw),cos(sw))*d;
      float spiral=sin(atan(dd.y,dd.x)*2.+e*9.);
      vec3 sc=mix(uPal[4],uPal[3],.5+.5*spiral);
      if(i>0) sc=mix(sc,vec3(.96,.93,.88),h3>.5?.55:0.);
      gc=mix(gc,sc*1.1,m*(i==0?.9:.75));
      float ring=smoothstep(.75,.9,e)*(1.-smoothstep(.9,1.05,e));
      gc*=1.+.3*ring;
    }
  }
  gc=mix(gc,uPal[2]*.8,smoothstep(.75,1.,abs(lat))*.45);
  sAlb=gc*(.65+.6*turb)*.82;
  sBump=0.;
}

float gRingB;
float ringDens(float r){
  float t=(r-uRing.x)/(uRing.y-uRing.x);
  if(t<0.||t>1.) return 0.;
  float hf=clamp(uUnit/80.,0.,1.);
  float b=vn(vec3(r*22.,uOff.x,0.))*.55+vn(vec3(r*70.,uOff.y,1.))*.3+vn(vec3(r*210.,uOff.z,2.))*.15*hf+.15*(1.-hf)*.5;
  gRingB=b;
  float gap=1.-.92*exp(-pow((t-(.58+.1*fract(uOff.x)))/.025,2.));
  float gap2=1.-.6*exp(-pow((t-.82)/.015,2.));
  float edge=smoothstep(0.,.03,t)*smoothstep(1.,.96,t);
  return clamp(smoothstep(.12,.7,b)*gap*gap2*edge*(.55+.6*t),0.,1.);
}

float cloudAt(vec3 qo, int oct){
  float ca=uTime*.012;
  vec3 qc=vec3(cos(ca)*qo.x+sin(ca)*qo.z,qo.y,-sin(ca)*qo.x+cos(ca)*qo.z);
  vec3 cp=qc*3.2+uOff*.7;
  if(uType==5) cp*=vec3(1.,2.2,1.);
  float wk=uType==5?.3:1.2;
  vec3 cw=(vec3(vn(cp*.9),vn(cp*.9+4.),vn(cp*.9+8.))-.5)*wk;
  float cn=fbm(cp+cw,oct);
  float thr0=.72-gAD*.24+(uType==5?.1:0.)+(uType==1?.07:0.);
  float w=uType==5?.3:mix(.2,.1,smoothstep(70.,300.,uUnit));
  return smoothstep(thr0,thr0+w,cn)*(uType==3?.25:(uType==5?.38:1.));
}

vec4 shadePlanet(vec2 p){
  float rr=length(p);
  float aaw=1./max(uUnit,1.);
  float cover=clamp((1.-rr)/aaw+.5,0.,1.);
  bool inDisc=rr<1.+aaw;
  float zp=-9.;
  vec3 lin=vec3(0.); float alpha=0.;
  vec3 Lo=uL*uRot;           // light in object space
  gAD=uAtmoDen; gAC=uAtmoCol;
  float fwd=pow(clamp(-uL.z,0.,1.),1.3);   // star behind the planet (as seen by the camera)
  if(inDisc){
    float z=sqrt(max(1.-dot(p,p),0.));
    vec3 Nv=normalize(vec3(p,max(z,.0001)));
    vec3 Vv=vec3(0.,0.,1.);
    gUE=uUnit;
    if(uCamD>1.02 && uCamD<40.){   // true perspective ray-sphere hit: no limb stretching, centre is magnified (close-ups stay crisp)
      float ta=1./sqrt(uCamD*uCamD-1.);
      float tn=rr*ta, cth=1./sqrt(1.+tn*tn), sth=tn*cth;
      float disc=1.-uCamD*uCamD*sth*sth;
      if(disc>=0.){
        vec2 dxy=rr>1e-4?p/rr*sth:vec2(0.);
        float t=uCamD*cth-sqrt(disc);
        vec3 P=vec3(dxy*t,uCamD-cth*t);
        Nv=normalize(P); z=Nv.z; Vv=normalize(vec3(0.,0.,uCamD)-P);
      }
      gUE=uUnit/max((uCamD-1.)*ta,.05);
    }
    zp=z;
    vec3 qo=Nv*uRot;
    gOct = gUE>420. ? 6 : (gUE>85. ? 5 : (gUE>28. ? 4 : 3));
    sAlb=vec3(.5); sWater=0.; sGloss=0.; sBump=0.; sScale=1.; sH=.5; sLand=1.; sCoast=0.; sEmis=vec3(0.); sLights=vec3(0.); sSpark=0.; sSand=0.;
    if(uType==0) surfRocky(qo);
    else if(uType==1) surfOcean(qo);
    else if(uType==2) surfIce(qo);
    else if(uType==3) surfLava(qo);
    else if(uType==4) surfGas(qo);
    else surfDesert(qo);

    if(uType!=4 && uUnit>110.){   // keep close-ups crisp: fine grain on every solid surface
      float fd=smoothstep(110.,300.,uUnit);
      float mg=(vn(qo*130.+uOff)-.5)*.3+(vn(qo*330.+uOff*2.)-.5)*.2;
      sAlb*=1.+mg*fd*(1.-sWater*.8);
    }
    gPyro=vec3(0.); gVShade=0.; gCyc=0.;
    float ndlg=dot(qo,Lo);
    if((uVolcKind==1||uVolcKind==2) && uUnit>8.) volcanoGround(qo,Lo);
    if(uType==0 && uSpecial==0 && uUnit>14.) impactFx(qo);
    sAlb*=1.-gVShade*.7;
    vec3 Nb=qo;
    if(sBump>0. && uUnit>30.){
      vec3 T1=normalize(cross(qo,vec3(0.,1.,.001)));
      vec3 T2=cross(qo,T1);
      float e=clamp(1.3/gUE,.0012,.01);
      float h1=terrainH(normalize(qo+T1*e),sScale);
      float h2=terrainH(normalize(qo+T2*e),sScale);
      vec2 g=(vec2(h1,h2)-sH)/e;
      Nb=normalize(qo-sBump*(gOct>5?.085:.12)*(g.x*T1+g.y*T2));
      sAlb*=.78+.5*clamp(sH,0.,1.);              // height ambient occlusion
    }
    gFoam=0.;
    if(uType==1 && sWater>.02 && uUnit>22.) Nb=oceanFx(qo,Nb,ndlg);
    float ndl=dot(Nb,Lo);
    float soft=smoothstep(-.10,.22,ndlg);
    float diff=max(ndl,0.)*.85+max(ndlg,0.)*.15;
    float lit=diff*soft;
    // ring shadow on planet
    if(uRing.w>.5){
      vec3 n=uRot[1];
      float den=dot(n,uL);
      if(abs(den)>.02){
        float t=-dot(n,Nv)/den;
        if(t>0.){
          float rd=length(Nv+t*uL);
          float rdn=ringDens(rd);
          lit*=1.-.92*uRing.z*rdn;
        }
      }
    }
    float dust=0.;
    if(uType==5 && uUnit>20.){
      dust=dustAt(qo);
      float dsh=dustAt(normalize(qo+Lo*.06));
      sAlb*=1.-.5*dsh*(1.-dust);
    }
    // clouds (+ their shadows on the ground)
    float cover2=0.; vec3 cc=vec3(1.);
    float cn=0.;
    if(gAD>.2 && uType!=4){
      int co=gOct;
      cover2=cloudAt(qo,co);
      if(uType==1){   // cyclones: crisp spirals, only over open ocean
        float cs0,cs1; float cd=max(cyc(qo,0,cs0),cyc(qo,1,cs1))*smoothstep(.25,.85,sWater);
        cover2=max(cover2*(1.-.55*max(cs0,cs1)*smoothstep(.25,.85,sWater)),cd);
      }
      if(uUnit>35.){
        float sh=cloudAt(normalize(qo+Lo*.05),3);
        sAlb*=1.-.5*sh*(1.-cover2);
      }
      float tintK=(uType==5||uType==3)?.55:.12;
      if(uSpecial==3) tintK=.45; if(uSpecial==2) tintK=.8;
      cc=mix(vec3(1.),gAC*1.1+.25,tintK);
      if(uType==3) cc*=.35;
    }
    vec3 sunTint=mix(uType==2?vec3(.68,.82,1.):vec3(1.,.45,.2),vec3(1.),smoothstep(-.02,.4,ndlg));
    sunTint=mix(vec3(1.),sunTint,clamp(gAD*1.3,0.,1.));
    vec3 lcol=uLightCol*sunTint;
    vec3 amb=mix(vec3(.5,.62,.95),gAC,.35)*(.03+.04*gAD)*(.5+.5*smoothstep(-.3,.2,-ndlg)+.0);
    vec3 col=sAlb*lit*lcol*1.02 + sAlb*(.012+amb*(1.-.7*clamp(lit,0.,1.)));   // starlit + earthshine/ambient fill on the night side
    // specular: broad sheen + tight sun glint, Fresnel mix of sky on water
    vec3 Vo=Vv*uRot;
    vec3 Hh=normalize(Lo+Vo);
    float ndh=max(dot(Nb,Hh),0.);
    float ndv=dot(Nv,Vv);
    float fres=.02+.98*pow(1.-ndv,5.);
    if(uType==1){
      float sp=pow(ndh,1200.)*14.+pow(ndh,260.)*2.2+pow(ndh,38.)*.22;
      col=mix(col,col+gAC*.55*lcol*(.15+.85*soft),fres*sWater);
      col+=sp*lcol*sGloss*soft*step(0.,ndl);
    } else {
      col+=pow(ndh,40.)*sGloss*.6*lcol*soft*step(0.,ndl);
    }
    // special worlds: Erid murk, Adrian green haze
    if(uSpecial==2){
      vec3 ew=vec3(vn(qo*3.+uTime*.05),vn(qo*3.+4.+uTime*.04),vn(qo*3.+8.))-.5;
      float hz=.3+.4*fbm(qo*4.+ew*1.8+vec3(0.,uTime*.04,0.)+uOff,3);
      vec3 murk=vec3(.62,.42,.2)*lcol*(.03+.97*soft*clamp(ndlg*.8+.3,0.,1.));
      col=mix(col,murk,clamp(hz+.35*(1.-ndv),0.,.9));
      col+=vec3(.5,.11,.02)*.07*(1.-soft)*(.5+fbm(qo*6.+uOff,3));   // ember glow on the night side
    } else if(uSpecial==3){
      vec3 gh=vec3(.34,.6,.3)*lcol*(.03+.97*soft*clamp(ndlg*.8+.3,0.,1.));
      col=mix(col,gh,clamp(.16+.34*(1.-ndv),0.,.6));
    }
    if(cover2>0.){
      float cl=smoothstep(-.12,.25,ndlg)*(.3+.7*max(ndlg,0.))*(.8+.35*cn+.2)*(uType==1?.7+.3*gCyc+.2*vn(qo*95.+uOff)+.12*vn(qo*260.):1.);
      col=mix(col,cc*cl*lcol*(uSpecial==3?.85:1.1)+cc*.01,cover2*.9);
    }
    col+=sEmis*(1.-.5*soft)*(1.-cover2*.6);
    // city lights: clustered along coasts and populated continents
    if(uSpecial==1){
      float pop=smoothstep(.44,.72,fbm(qo*5.+uOff,3))*(sCoast*.85+.3)*sLand;
      float clus=smoothstep(.52,.85,fbm(qo*38.+uOff,2));
      float net=smoothstep(.62,.9,vn(qo*150.+uOff))*.3;
      sLights=vec3(1.,.72,.38)*pop*(clus*1.1+net+.04)*(1.-smoothstep(.0,.45,sH-.6));
    } else if(uSpecial==3){
      float v=abs(fbm(qo*6.+uOff,3)*2.-1.);
      sLights=vec3(.15,1.,.6)*(1.-smoothstep(0.,.06,v))*.9;
    }
    col+=sLights*(1.-soft)*(1.-cover2);
    // dust front over deserts
    if(dust>.01) col=mix(col,mix(uPal[2],vec3(.8,.62,.4),.5)*lcol*(.25+.75*max(ndlg,0.))*1.1+vec3(.02,.012,.008),dust*.6);
    // pyroclastic glow lighting terrain, clouds and haze
    col+=gPyro*(.5+.8*dot(sAlb,vec3(.6))+cover2*.9)*1.4*(1.+gAD);
    // lightning: frequent cloud-lit bursts on the night side, some with branching bolts
    if((uType==4||uSpecial==1||uSpecial==2) && uUnit>16.){
      float fg=flashGlow(qo,Lo,Vo);
      float cm=(uType==4)?1.:(.25+cover2*.9);
      col+=vec3(.72,.84,1.)*fg*cm*2.4*(1.-.5*clamp(lit,0.,1.))+vec3(.88,.93,1.)*gBolt*4.*(.4+.6*cm);
    }
    // aurora rings at the poles
    if((uType==4||uSpecial==1) && uUnit>25.){
      float ay=abs(qo.y);
      float ring=exp(-pow((ay-(uType==4?.84:.87))/.045,2.));
      vec2 ae=normalize(qo.xz+vec2(1e-4));
      float cur=vn(vec3(ae*5.+vec2(-ae.y,ae.x)*uTime*.12,qo.y*3.+uTime*.2))*.6+.4*vn(vec3(ae*14.,uTime*.5));
      float ray=smoothstep(.35,.8,cur)*(.6+.4*sin(uTime*1.7+ae.x*30.));
      vec3 ac=mix(vec3(.1,1.,.5),vec3(.6,.25,.95),smoothstep(.84,.95,ay));
      col+=ac*ring*ray*1.6*(1.-.8*soft)*smoothstep(25.,70.,uUnit)*clamp(gAD*1.5,.3,1.)*(uType==4?.7:1.);
    }
    // ice: sublimation haze along the terminator
    if(uType==2 && uUnit>25.){
      float hzI=exp(-pow(ndlg/.3,2.))*(.5+.8*fbm(qo*6.+vec3(uTime*.03,0.,0.),3));
      col+=vec3(.82,.93,1.)*(hzI*.5+pow(1.-ndv,2.5)*.4*smoothstep(-.35,.3,ndlg))*vec3(1.,1.,1.);
      col+=vec3(.85,.95,1.)*sSpark*clamp(lit+.1,0.,1.)*uLightCol;
    }
    // Adrian: Astrophage bloom, dark-red shimmering swirls in the upper atmosphere; coverage and strength grow with infection
    if(uSpecial==3 && uUnit>12.){
      vec3 w=qo*2.6+uOff; float tb=uTime*.06;
      vec3 wp=vec3(vn(w*1.3+vec3(tb,0.,0.)),vn(w*1.3+vec3(0.,tb,5.)),vn(w*1.3+vec3(3.,0.,tb)))-.5;
      float n=fbm(w+wp*2.4+vec3(0.,tb*2.,0.),4);
      float fil=.5+.5*sin(n*28.+uTime*.7+fbm(w*3.+wp*3.,2)*6.);
      float thr=mix(.53,.33,clamp(uInfect*2.,0.,1.));
      float cov=smoothstep(thr,thr+.1,n);
      float k=clamp(cov*(.5+.5*smoothstep(.25,.85,fil))*(.95+.6*uInfect),0.,1.);
      col=mix(col,col*vec3(.2,.03,.025)+vec3(.05,.004,.003)*(.4+.6*soft),k*.93);
      float shim=pow(vn(qo*55.+vec3(0.,0.,uTime*.9)),2.)*(.5+.5*sin(uTime*2.+n*30.));
      col+=vec3(.7,.04,.02)*shim*k*.32*(.45+.55*soft);
      col+=vec3(.5,.02,.01)*k*.28*(1.-soft)+vec3(.55,.03,.015)*smoothstep(.8,1.,fil)*cov*.16*(.5+.5*soft);
      col+=vec3(.5,.035,.015)*pow(1.-ndv,2.)*k*.35;
    }
    // orbital scan sweep: painted arc trailing the sweep line, a footprint under the ship, hotspot marker
    if(uScan.x>.5){
      float lon=atan(qo.z,qo.x), lat=asin(clamp(qo.y,-1.,1.));
      float rel=mod(lon-uScan.y+12.56637,6.28318)/6.28318;
      float cov=uScan.z;
      float painted=step(rel,cov);
      float lines=.5+.5*sin(lat*90.+uTime*1.5);
      float grid=max(smoothstep(.93,1.,abs(sin(lat*12.))),smoothstep(.93,1.,abs(sin(lon*12.))));
      col+=uScanCol*painted*(.06+.05*lines+.12*grid)*(.4+.6*soft);
      float edge=exp(-pow((rel-cov)/.008,2.))*step(cov,.999)*step(.001,cov);
      col+=uScanCol*edge*(1.2+.6*sin(uTime*14.));
      float ang=acos(clamp(dot(Nv,uScanSub),-1.,1.));
      float fp=smoothstep(uScan.w,uScan.w*.6,ang);
      float ringe=exp(-pow((ang-uScan.w)/(uScan.w*.08),2.));
      col+=uScanCol*(fp*(.22+.12*sin(uTime*18.))+ringe*.9);
    }
    if(uMark.w>.0){
      float ma=acos(clamp(dot(qo,uMark.xyz),-1.,1.));
      float pulse=.5+.5*sin(uTime*5.);
      col+=vec3(.4,1.,.5)*(exp(-pow((ma-uMark.w)/(uMark.w*.14),2.))*(.8+.6*pulse)+smoothstep(uMark.w*.3,0.,ma)*.5);
    }
    // atmospheric scattering: thick limb, terminator sunset, backlit forward scatter
    float rim=pow(1.-ndv,2.3);
    float sunside=smoothstep(-.25,.45,ndlg);
    float gasK=uType==4?.6:1.;
    float sunset=exp(-pow(ndlg/.18,2.));
    vec3 ssc=uType==2?vec3(.7,.85,1.):mix(vec3(1.,.4,.12),gAC,.25);
    vec3 sky=mix(gAC,vec3(1.)*.9+gAC*.1,.15);
    col+=(sky*rim*1.15*sunside*(1.+fwd*2.5) + ssc*sunset*(.25*ndv+rim*.9)*.8)*gAD*gasK*uLightCol;
    col+=gAC*.07*gAD*lit*uLightCol;
    col+=gAC*pow(1.-ndv,4.)*.25*gAD*max(ndlg,0.)*uLightCol*.5;   // subtle rim light
    lin=col*cover; alpha=cover;
  }
  // halo outside / at limb
  {
    float H=.06+.14*gAD;
    float t=(rr-1.)/H;
    if(t>-.3 && t<1.6 && gAD>.01){
      vec2 d=p/max(rr,.001);
      float nl=dot(vec3(d,0.),uL);
      float sunside=smoothstep(-.25,.45,nl);
      float sunset=exp(-pow(nl/.18,2.));
      float f=exp(-max(t,0.)*3.)*(1.-smoothstep(1.,1.6,t));
      vec3 ssc=uType==2?vec3(.7,.85,1.):mix(vec3(1.,.4,.12),gAC,.25);
      float gasK=uType==4?.6:1.;
      vec3 halo=(gAC*1.15*sunside*(1.+fwd*2.5)+ssc*sunset*.8)*gAD*gasK*f*uLightCol;
      halo*=.8;
      halo+=gAC*vec3(1.,1.1,1.2)*fwd*smoothstep(-.7,.9,nl)*exp(-max(t,0.)*2.2)*(1.-smoothstep(1.,1.6,t))*gAD*1.6*uLightCol;
      if(uSpecial==2) halo*=1.3;
      lin+=halo*(1.-cover);
    }
  }
  // rings
  if(uRing.w>.5){
    vec3 n=uRot[1];
    if(abs(n.z)>.03){
      float zr=-(n.x*p.x+n.y*p.y)/n.z;
      vec3 Pr=vec3(p,zr);
      float rd=length(Pr);
      float dens=ringDens(rd);
      if(dens>.001 && (!inDisc || zr>zp)){
        float shade=1.;
        float b=dot(Pr,uL);
        if(b<0.){ float dd=sqrt(max(dot(Pr,Pr)-b*b,0.)); shade=smoothstep(.93,1.03,dd); }
        float dn=dot(n,uL);
        float same=step(0.,dn*n.z);
        float transm=(.25+2.2*fwd)*(1.-.5*dens)*(1.-.4*uRing.z);
        float light=mix(.06+transm,.22+.78*abs(dn),same)*shade+.02;
        float grain=uUnit>70.?(.78+.45*vn(Pr*210.+uOff)):1.;
        vec3 rcv=mix(vec3(1.1,.95,.8),vec3(.82,.9,1.05),vn(vec3(rd*8.,uOff.x,3.)));
        vec3 rc=uRingCol*rcv*(.55+.8*gRingB)*grain*light*uLightCol*1.5;
        float ra=clamp(uRing.z*dens,0.,.96);
        lin=rc*ra+lin*(1.-ra);
        alpha=ra+alpha*(1.-ra);
      }
    }
  }
  return vec4(lin,alpha);
}

vec4 shadeStar(vec2 p){
  float rr=length(p);
  float aaw=1./max(uUnit,1.);
  float cover=clamp((1.-rr)/aaw+.5,0.,1.);
  vec3 c0=sat(uStarCol/max(max(uStarCol.r,uStarCol.g),max(uStarCol.b,.001)),1.5);
  float t=uTime*.15;
  float inf=uInfect;
  vec3 hdr=vec3(0.);
  if(rr<1.+aaw){
    float z=sqrt(max(1.-dot(p,p),0.));
    float mu=z;
    vec3 q=vec3(p,z)*uRot;
    int o=uUnit>60.?4:3;
    // animated granulation (two layers) + supergranulation
    vec3 gp=q*26.+uOff;
    float g1=fbm(gp+vec3(0.,0.,t*2.),o);
    float g2=uUnit>40.?fbm(gp*2.1+vec3(t*3.,5.,0.),3):.5;
    float sg=fbm(q*4.+uOff+vec3(t*.5),2);
    float gran=mix(.86,1.14,smoothstep(.3,.7,g1))+(g2-.5)*.14;
    gran*=.93+.14*sg;
    // sunspots in latitude bands
    float lat=abs(q.y);
    float sn=fbm(q*2.3+uOff+vec3(0.,t*.03,0.),3);
    float lm=smoothstep(.85,.3,lat);
    float sv=sn+(lm-.5)*.2;
    float umbra=smoothstep(.76,.8,sv), pen=smoothstep(.69,.73,sv);
    // faculae brighten near the limb
    float fac=smoothstep(.52,.72,fbm(q*8.+uOff*.6,3))*smoothstep(.2,.85,1.-mu)*(1.-umbra);
    gran+=fac*.5;
    gran*=1.-pen*.35; gran*=1.-umbra*.6;
    // limb darkening with reddening
    float ld=1.-.5*(1.-mu);
    vec3 lc=mix(vec3(1.),vec3(1.,.6,.38),pow(1.-mu,1.5));
    vec3 col=c0*(.35+.65*gran)*ld*lc*2.5;   // emissive: bright photosphere, spots stay darker
    col=mix(col,col*vec3(1.,.6,.4),umbra*.4);
    col=mix(col,vec3(2.2),.12*(1.-pow(1.-mu,2.)));   // hot white core
    if(inf>.001){
      // Astrophage colonies: crawling dark mottled patches, pulsing, with an infrared shimmer
      vec3 ap=q*2.6+uOff*1.7;
      vec3 w=vec3(vn(ap*1.6+vec3(t*.6,0.,0.)),vn(ap*1.6+vec3(0.,t*.5,7.)),vn(ap*1.6+vec3(3.,0.,t*.4)))-.5;
      float n=fbm(ap+w*1.6,4)*.65+fbm(q*11.+uOff+w*2.,3)*.35;
      float pulse=.035*sin(uTime*.9+n*12.)*(.5+inf);
      float thr=.80-inf*.5+pulse;
      float dark=smoothstep(thr,thr+.05,n);
      float edge=smoothstep(thr-.06,thr,n)*(1.-dark);
      float tex=fbm(q*30.+uOff,2);
      vec3 astro=vec3(.025,.004,.003)*(.6+.8*tex);
      float shim=pow(vn(q*22.+vec3(0.,0.,uTime*.9)+uOff),2.)*(.6+.4*sin(uTime*1.4+n*20.));
      vec3 ir=vec3(.55,.045,.02)*shim*(.25+.9*inf)*dark;
      col=mix(col,astro,dark*.96)+ir;
      col+=vec3(1.,.22,.06)*edge*.5*(.4+inf);
      col*=1.-.25*inf;
    }
    hdr+=col*cover;
  }
  if(rr>.97){
    float x=max(rr-1.,0.);
    float ang=atan(p.y,p.x);
    vec2 cs=vec2(cos(ang),sin(ang));
    float st1=vn(vec3(cs*3.2,t*.6)+uOff);
    float st2=vn(vec3(cs*8.,t*.4)+uOff+9.);
    float stm=pow(clamp(st1*.65+st2*.35,0.,1.),2.4)*2.6;
    float cor=exp(-x*6.)*1.+exp(-x*1.7)*.26*(.35+stm)+exp(-x/(.35+1.2*stm))*stm*.05+exp(-x*.45)*.03;
    cor*=1.-.5*inf;
    vec3 cc=mix(c0,vec3(1.),exp(-x*7.)*.45);
    vec3 glow=cc*cor;
    // prominences / flares on the limb
    if(x<.6){
      for(int i=0;i<3;i++){
        float fi=float(i);
        float u=uTime/(13.+4.*fi)+fi*.37;
        float cyc=floor(u), f=fract(u);
        float env=sin(f*3.14159); env*=env;
        float a0=hash13(vec3(cyc,fi,uOff.x))*6.28318;
        float da=abs(mod(ang-a0+3.14159,6.28318)-3.14159);
        float w=.09+.09*hash13(vec3(cyc,fi+3.,uOff.y));
        float hgt=(.1+.22*hash13(vec3(cyc,fi+7.,uOff.z)))*env;
        if(da<w && hgt>.01){
          float hh=hgt*sqrt(1.-da*da/(w*w));
          float loop=exp(-pow((x-hh)/(.02+.012*env),2.));
          float under=x<hh?.1*(1.-x/hh):0.;
          glow+=mix(vec3(1.,.36,.22),c0,.2)*(loop*1.1+under)*env;
        }
      }
    }
    // drifting Astrophage specks around infected stars
    if(inf>.02 && rr>1.02){
      float ang01=ang/6.28318+.5;
      for(int L=0;L<2;L++){
        float fl=float(L);
        float nA=36.+24.*fl;
        float sR=5.+3.*fl;
        vec2 gc=vec2(ang01*nA,(rr-1.)*sR-uTime*(.35+.2*fl));
        vec2 id=floor(gc), fr=fract(gc);
        float h=hash12(id+fl*17.3);
        if(h<inf*.16){
          vec2 j=vec2(hash12(id+3.7),hash12(id+9.1));
          vec2 dd=vec2((fr.x-(.2+.6*j.x))*(6.28318*rr/nA),(fr.y-(.2+.6*j.y))/sR);
          float pr=max(.014,.9/uUnit);
          float k=smoothstep(pr,0.,length(dd));
          float fade=smoothstep(1.02,1.3,rr)*(1.-smoothstep(2.2,3.6,rr));
          glow+=vec3(1.,.18,.07)*k*(.6+.6*h)*(.5+inf)*1.5*fade*(.7+.3*sin(uTime*3.+h*40.));
        }
      }
    }
    float ir=exp(-x*.5)*.14*inf*(.85+.15*sin(uTime*.6));
    glow+=vec3(.9,.1,.04)*ir;
    glow*=1.-smoothstep(uQuad*.6,uQuad,rr);
    hdr+=glow*(1.-cover);
  }
  // colour-preserving exposure (no desaturation to white like ACES)
  return vec4(1.-exp(-hdr*1.5),cover);
}

vec4 shadeFlare(){
  vec2 fc=gl_FragCoord.xy; vec2 d=fc-uFlarePos; float R=max(uFlareR,2.);
  float dl=length(d);
  vec3 c=sat(uFlareCol,1.2);
  vec3 col=c*pow(R/(dl+R*.9),2.2)*.08;
  float ca=.35, sa=sin(ca), co=cos(ca);
  vec2 r1=vec2(co*d.x+sa*d.y,-sa*d.x+co*d.y);
  float s45=.7071;
  vec2 r2=vec2(s45*(r1.x+r1.y),s45*(r1.y-r1.x));
  float w=R*.025+.5;
  float Ls=min(R*2.4,uRes.y*.22);
  float sp=exp(-abs(r1.y)/w)*exp(-abs(r1.x)/Ls)+exp(-abs(r1.x)/w)*exp(-abs(r1.y)/Ls);
  sp+=.25*(exp(-abs(r2.y)/w)*exp(-abs(r2.x)/(Ls*.5))+exp(-abs(r2.x)/w)*exp(-abs(r2.y)/(Ls*.5)));
  sp*=smoothstep(R*.9,R*1.1,dl);
  col+=mix(c,vec3(1.),.3)*sp*.28;
  vec2 ctr=uRes*.5; vec2 v=ctr-uFlarePos;
  float gfade=smoothstep(R*1.5,R*6.,length(v));
  const float KS[4]=float[4](.45,1.35,1.9,-.35);
  const float GS[4]=float[4](.035,.07,.025,.05);
  const vec3 KC[4]=vec3[4](vec3(.5,.7,1.),vec3(1.,.55,.3),vec3(.5,1.,.7),vec3(.9,.6,1.));
  for(int i=0;i<4;i++){
    vec2 gp=uFlarePos+v*KS[i];
    float gr=uRes.y*GS[i];
    float dd=length(fc-gp);
    float disc=smoothstep(gr,gr*.7,dd)*.35+exp(-pow((dd-gr)/(gr*.08),2.))*.5;
    col+=KC[i]*c*disc*.2*gfade;
  }
  col*=uFlareStr;
  return vec4(1.-exp(-col*1.5),0.);
}

void main(){
  if(uMode==2){
    float r=length(vPx);
    float line=1.-smoothstep(0.,1.6,abs(r-uUnit));
    float ang=atan(vPx.y,vPx.x);
    float dash=step(.5,fract(ang*8./6.28318+uTime*.1));
    float a=line*(.5+.5*dash);
    outc=vec4(vec3(.45,.9,1.)*a,a);
    return;
  }
  if(uMode==3){ outc=shadeFlare(); return; }
  vec2 p=vPx/uUnit;
  if(uMode==1){ outc=shadeStar(p); return; }
  vec4 r=shadePlanet(p);
  vec3 dc=display(r.rgb*.68); dc=mix(dc,dc*dc*(3.-2.*dc),.4);   // mild S-curve: deeper mid-tones, less washed-out
  outc=vec4(dc, r.a);
}`;
