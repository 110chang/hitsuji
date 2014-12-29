/*
*
*   geom.Vector r1
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/like'
], function(extend, like) {
  var sin  = Math.sin;
  var cos  = Math.cos;
  var sqrt = Math.sqrt;
  var asin = Math.asin;
  var acos = Math.acos;
  var PI   = Math.PI;

  function polarToComponent(mag, dir) {
    var x = mag * cos(dir * PI / 180);
    var y = mag * sin(dir * PI / 180);
      
    return { x: x, y: y };
  }
  function componentToPolar(x, y) {
    var mag = sqrt(x * x + y * y);
    var dir = 0;
    
    if (mag === 0) {
      return { mag: mag, dir: dir };
    }
    dir = (180 / PI) * asin(y / mag);
    
    if (x < 0) {
      dir = 180 - dir;
    } else if (x < 0 && y < 0) {
      dir += 360;
    }
    return { mag: mag, dir: dir };
  }
  function Vector(a, b, isComponent) {
    if (!(this instanceof Vector)) {
      return new Vector(a, b, isComponent);
    }
    a = a == null ? 0 : a;
    b = b == null ? 0 : b;
    isComponent = isComponent == null ? true : isComponent;
    
    if (typeof a !== 'number' || typeof b !== 'number') {
      throw new Error('Arguments must be Number.');
    }
    var o, x, y, mag, dir;

    if (isComponent) {
      x = a;
      y = b;
      o = componentToPolar(a, b);
      mag = o.mag;
      dir = o.dir;
    } else {
      mag = a;
      dir = b;// Degree
      o = polarToComponent(a, b);
      x = o.x;
      y = o.y;
    }
    this.x = x;
    this.y = y;
    this.magnitude = mag;
    this.direction = dir;
  }
  extend(Vector.prototype, {
    x        : 0,
    y        : 0,
    magnitude: 0,
    direction: 0,

    getComponent: function() {
      return { x: this.x, y: this.y };
    },
    getPolar: function() {
      return {
        magnitude: this.magnitude,
        direction: this.direction
      };
    },
    add: function(vector) {
      if (!like(vector, Vector.prototype)) {
        throw new Error('Arguments must be Vector.');
      }
      this.x += vector.x;
      this.y += vector.y;
      var polar = componentToPolar(this.x, this.y);
      this.magnitude = polar.mag;
      this.direction = polar.dir;
      
      return this;
    },
    sub: function(vector){
      if (!like(vector, Vector.prototype)) {
        throw new Error('Arguments must be Vector.');
      }
      this.x -= vector.x;
      this.y -= vector.y;
      var polar = componentToPolar(this.x, this.y);
      this.magnitude = polar.mag;
      this.direction = polar.dir;
      
      return this;
    },
    scalarMultiply: function(num){
      if (typeof num !== 'number') {
        throw new Error('Arguments must be Number.');
      }
      this.x *= num;
      this.y *= num;
      var polar = componentToPolar(this.x, this.y);
      this.magnitude = polar.mag;
      this.direction = polar.dir;
      
      return this;
    },
    innerProduct: function(vector) {
      if (!like(vector, Vector.prototype)) {
        throw new Error('Arguments must be Vector.');
      }
      return this.x * vector.x + this.y * vector.y;
    },
    crossProduct: function(vector) {
      if (!like(vector, Vector.prototype)) {
        throw new Error('Arguments must be Vector.');
      }
      return this.x * vector.y - this.y * vector.x;
    },
    angleBetween: function(vector) {
      if (!like(vector, Vector.prototype)) {
        throw new Error('Arguments must be Vector.');
      }
      return acos(this.innerProduct(vector) / this.magnitude * vector.magnitude);
    },
    normalize: function(){
      return new Vector(1, this.direction, false);
    }
  });

  return Vector;
});