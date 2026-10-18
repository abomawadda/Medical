import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {parts,greeting}=createRequire(import.meta.url)('../../js/names.js');
test('three logical name parts retain Arabic compound names without inventing missing names',()=>{
 for(const [value,expected] of [
 ['محمود محمد أحمد علي','محمود محمد أحمد'],
 ['أحمد عبد الله محمد علي','أحمد عبد الله محمد'],
 ['أحمد محمد أبو النجا السيد','أحمد محمد أبو النجا'],
 ['عبد الله أبو بكر حسن علي','عبد الله أبو بكر حسن'],
 ['نور الدين محمد عبد الرحمن علي','نور الدين محمد عبد الرحمن'],
 ['سيف الدين عبد الله أبو بكر حسن','سيف الدين عبد الله أبو بكر'],
 ['عضو الاختبار','عضو الاختبار'],['أحمد محمد أبو','أحمد محمد'],['','']
 ])assert.equal(greeting(value),expected,value);
 assert.deepEqual(parts('أحمد محمد أبو النجا السيد'),['أحمد','محمد','أبو النجا']);
 assert.equal(greeting('  محمود   عبد   الله حسن إبراهيم '),'محمود عبد الله حسن');
});
