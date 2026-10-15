import test from 'node:test';
import assert from 'node:assert/strict';
import { reserve, validateProject, pagePrompt } from './workflow.js';
test('spending reservations stop before crossing the book limit', () => {
 const project={reserved:0,budget:1};reserve(project,.5);reserve(project,.5);
 assert.throws(()=>reserve(project,.05),/Budget limit/);assert.equal(project.reserved,1);
 assert.throws(()=>reserve(project,NaN));assert.throws(()=>reserve(project,-1));
});
test('project validation rejects missing direction and excessive page counts',()=>{
 assert.throws(()=>validateProject({title:'Book',brief:'Animals',count:41,budget:5}));
 assert.throws(()=>validateProject({title:'Book',brief:'',count:5,budget:5}));
 assert.throws(()=>validateProject({title:'Book',brief:'Animals',count:5,budget:'invalid'}));
 assert.equal(validateProject({title:' Book ',brief:'Animals',count:'5',budget:'5'}).count,5);
});
test('revision instructions retain the book direction and specific page brief',()=>{
 const text=pagePrompt({brief:'Bold woodland animals'},{number:2,idea:'Fox reading',feedback:'Remove the floating leaf'});
 assert.match(text,/Bold woodland animals/);assert.match(text,/Fox reading/);assert.match(text,/Remove the floating leaf/);
});
