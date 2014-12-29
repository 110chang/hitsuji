/*
*
*   geom.Circle r1
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/like',
  'mod/geom/point'
], function(extend, like, Point) {
  var pow = Math.pow;

  function Circle(x, y, radius) {
    if (!(this instanceof Circle)) {
      return new Circle(x, y, radius);
    }
    x = x == null ? 0 : x;
    y = y == null ? 0 : y;
    radius = radius == null ? 1 : radius;

    if (typeof x !== 'number' || typeof y !== 'number' || typeof radius !== 'number') {
      throw new Error('Invalid arguments.');
    }
    this.x      = x;
    this.y      = y;
    this.center = new Point(x, y);
    this.radius = radius;
  }
  extend(Circle.prototype, {
    x      : 0,
    y      : 0,
    radius : 100,
    center : null,
    
    getCenter: function(){
      return this.center;
    },
    getRadius: function(){
      return this.radius;
    },
    translate: function(x, y) {
      if (typeof x !== 'number' || typeof y !== 'number') {
        throw new Error('Arguments must be Number.');
      }
      this.x += x;
      this.y += y;
      this.center.translate(x, y);
    },
    scale: function(s) {
      if (typeof s !== 'number') {
        throw new Error('Arguments must be Number.');
      }
      this.radius *= s;
    },
    contain: function(point) {
      if (!like(point, Point.prototype)) {
        throw new Error('Arguments must be Point.');
      }
      var d2 = pow(point.x - this.x, 2) + pow(point.y - this.y, 2);
      var r2 = this.radius * this.radius;
      return d2 <= r2;
    },
    collapse: function(circ) {
      if (!like(circ, Circle.prototype)) {
        throw new Error('Arguments must be Circle.');
      }
      var d2 = pow(circ.x - this.x, 2) + pow(circ.y - this.y, 2);
      var r2 = pow(this.radius + circ.radius, 2);
      return d2 <= r2;
    }
  });

  return Circle;
});