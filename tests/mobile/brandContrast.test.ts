import test from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, contrastText, gradientFor, forBackground, forDarkBackground } from '../../apps/mobile/src/lib/brandColors';

function mix(a: string,b: string,t: number) {
  const channels=(hex:string)=>hex.replace('#','').match(/../g)!.map(value=>parseInt(value,16));
  const x=channels(a),y=channels(b);
  return '#'+x.map((value,index)=>Math.round(value+(y[index]-value)*t).toString(16).padStart(2,'0')).join('');
}
test('texto e iconos mantienen contraste a través de todo el degradado, en ambos temas',()=>{
  const values=[0,51,102,153,204,255];
  for(const r of values)for(const g of values)for(const b of values){
    const brand='#'+[r,g,b].map(value=>value.toString(16).padStart(2,'0')).join('');
    for(const primary of [forBackground(brand),forDarkBackground(brand)]){
      const foreground=contrastText(primary);
      assert.ok(contrastRatio(primary,foreground)>=4.5,'Botón sólido '+primary);
      const [start,end]=gradientFor(primary);
      for(let i=0;i<=20;i++)assert.ok(contrastRatio(mix(start,end,i/20),foreground)>=4.5,
        'Degradado '+brand+' en '+i+' con texto '+foreground);
    }
  }
});
test('colores vacíos o inválidos usan un degradado legible de respaldo',()=>{
  const expected=gradientFor('#5842f4');
  for(const invalid of ['', '#fff', 'invalid', '#GGHHII'])assert.deepEqual(gradientFor(invalid),expected);
});
