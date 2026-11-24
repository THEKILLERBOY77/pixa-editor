// WebGL-рендерер: настройки + фильтры. Параметры в нормализованных единицах (-1..1).
(function () {
  const VS = `attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
  const FS = `precision highp float;
varying vec2 v;
uniform sampler2D tex;
uniform vec2 px;
uniform float exposure,brightness,contrast,saturation,vibrance,warmth,tint,highlights,shadows,fade,sharpen,vignette,grain,splitAmt;
uniform vec3 shTint,hiTint;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
float rnd(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  vec4 t=texture2D(tex,v);
  vec3 c=t.rgb;
  if(sharpen>0.){
    vec3 b=(texture2D(tex,v+vec2(px.x,0.)).rgb+texture2D(tex,v-vec2(px.x,0.)).rgb+texture2D(tex,v+vec2(0.,px.y)).rgb+texture2D(tex,v-vec2(0.,px.y)).rgb)*.25;
    c+=(c-b)*sharpen*3.;
  }
  c*=pow(2.,exposure*1.5);
  c+=brightness*.35;
  c=(c-.5)*(1.+contrast)+.5;
  float l=lum(c);
  c+=highlights*.28*smoothstep(.45,1.,l);
  c+=shadows*.28*(1.-smoothstep(0.,.55,l));
  c.r+=warmth*.12; c.b-=warmth*.12;
  c.g-=tint*.09; c.r+=tint*.045; c.b+=tint*.045;
  l=lum(c);
  c=mix(vec3(l),c,1.+saturation);
  float mx=max(c.r,max(c.g,c.b)), mn=min(c.r,min(c.g,c.b));
  c=mix(vec3(lum(c)),c,1.+vibrance*(1.-(mx-mn)));
  c=c*(1.-fade*.25)+fade*.1;
  float l2=lum(c);
  c+=splitAmt*(shTint*(1.-smoothstep(.1,.7,l2))+hiTint*smoothstep(.3,.9,l2));
  vec2 d=v-.5;
  float vv=smoothstep(.25,.85,length(d)*1.45);
  if(vignette>0.) c*=1.-vignette*.85*vv; else c=mix(c,vec3(1.),-vignette*.7*vv);
  c+=(rnd(gl_FragCoord.xy)-.5)*grain*.3;
  c=clamp(c,0.,1.);
  gl_FragColor=vec4(c*t.a,t.a);
}`;

  const KEYS = ['exposure', 'brightness', 'contrast', 'saturation', 'vibrance', 'warmth', 'tint', 'highlights', 'shadows', 'fade', 'sharpen', 'vignette', 'grain', 'splitAmt'];

  class Renderer {
    constructor(canvas) {
      this.c = canvas;
      const gl = (this.gl = canvas.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, alpha: true, antialias: false }));
      if (!gl) throw new Error('WebGL недоступен');
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const pr = (this.pr = gl.createProgram());
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.u = {};
      for (const k of KEYS.concat(['px', 'shTint', 'hiTint', 'tex'])) this.u[k] = gl.getUniformLocation(pr, k);
      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.w = 0; this.h = 0;
    }
    setImage(src) {
      const gl = this.gl;
      this.c.width = this.w = src.width;
      this.c.height = this.h = src.height;
      gl.viewport(0, 0, this.w, this.h);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    }
    render(p) {
      const gl = this.gl, u = this.u;
      p = p || {};
      gl.useProgram(this.pr);
      gl.uniform1i(u.tex, 0);
      gl.uniform2f(u.px, 1 / this.w, 1 / this.h);
      for (const k of KEYS) gl.uniform1f(u[k], p[k] || 0);
      const s = p.shTint || [0, 0, 0], h = p.hiTint || [0, 0, 0];
      gl.uniform3f(u.shTint, s[0], s[1], s[2]);
      gl.uniform3f(u.hiTint, h[0], h[1], h[2]);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  // Пресеты фильтров (в тех же нормализованных единицах)
  const FILTERS = [
    { id: 'none', name: 'Оригинал', p: {} },
    { id: 'vivid', name: 'Яркий', p: { contrast: .12, saturation: .3, vibrance: .2 } },
    { id: 'portrait', name: 'Портрет', p: { warmth: .12, saturation: .08, contrast: .06, brightness: .05, highlights: -.1 } },
    { id: 'warm', name: 'Тёплый', p: { warmth: .35, saturation: .1, contrast: .05 } },
    { id: 'cool', name: 'Холодный', p: { warmth: -.3, tint: -.05, contrast: .05 } },
    { id: 'film', name: 'Кино', p: { contrast: .15, saturation: -.1, fade: .3, splitAmt: 1, shTint: [-.03, .03, .06], hiTint: [.07, .03, -.04] } },
    { id: 'vintage', name: 'Винтаж', p: { fade: .5, warmth: .25, saturation: -.2, grain: .3, vignette: .3 } },
    { id: 'golden', name: 'Золотой час', p: { warmth: .5, exposure: .1, saturation: .2, highlights: -.1 } },
    { id: 'pastel', name: 'Пастель', p: { fade: .35, saturation: -.1, brightness: .1, exposure: .1 } },
    { id: 'dream', name: 'Мечта', p: { fade: .3, exposure: .15, saturation: .15, tint: .15, highlights: -.1 } },
    { id: 'food', name: 'Еда', p: { saturation: .3, warmth: .15, contrast: .12, sharpen: .3 } },
    { id: 'city', name: 'Город', p: { contrast: .25, saturation: -.15, warmth: -.1, sharpen: .3 } },
    { id: 'drama', name: 'Драма', p: { contrast: .35, saturation: .15, vignette: .3, shadows: -.15, sharpen: .4 } },
    { id: 'bw', name: 'Ч/Б', p: { saturation: -1, contrast: .15 } },
    { id: 'noir', name: 'Нуар', p: { saturation: -1, contrast: .4, vignette: .5, shadows: -.2 } },
    { id: 'neon', name: 'Неон', p: { contrast: .2, saturation: .4, splitAmt: 1, shTint: [.08, -.02, .1], hiTint: [-.02, .08, .06] } },
  ];

  PX.GL = { Renderer, FILTERS, KEYS };
})();
