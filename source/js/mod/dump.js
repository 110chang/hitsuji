/*
*
*   Dump r1
*
*   @author Yuji Ito @110chang
*
*/

define([], function() {
  function dump(o) {
    if (o == null) {
      throw new Error('Invalid arguments.');
    }
    var prop, str = '';
    for (prop in o) {
      str += prop + '\n';
    }
    return str;
  }
  
  return dump;
});
