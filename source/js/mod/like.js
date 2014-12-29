/*
*
*   Like r1
*
*   @author Yuji Ito @110chang
*
*/

define([], function() {
  function like(target, original) {
    if (target == null) {
      throw new Error('Invalid arguments.');
    }
    if (original == null) {
      throw new Error('Invalid arguments.');
    }
    for (var prop in original) {
      if (target[prop] === undefined) {
        return false;
      }
    }
    return true;
  }
  
  return like;
});
