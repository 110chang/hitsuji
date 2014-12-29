/*
*
*   geom.Ray r1
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/inherit',
  'mod/like',
  'mod/geom/point',
  'mod/geom/segment'
], function(extend, inherit, like, Point, Segment) {
  function Ray() {
    Segment.apply(this, arguments);
  }
  inherit(Ray, Segment);
  extend(Ray.prototype, {
    contain: function(point) {
      if (!like(point, Point.prototype)) {
        throw new Error('Arguments must be Point.');
      }
      var x0 = this.start.x;
      var y0 = this.start.y;
      var x1 = this.end.x;
      var y1 = this.end.y;
      
      if (point.x < x0 || point.y < y0) {
        return false;
      }
      return (y1 - y0) * point.x - (x1 - x0) * point.y - x0 * y1 + x1 * y0 === 0;
    },
    intersection: function(segment) {
      if (!like(segment, Segment.prototype)) {
        throw new Error('Arguments must be Segment.');
      }
      // ### Avoid a circular dependencies ###
      var Triangle = require('mod/geom/triangle');
      // ###
      var t1 = new Triangle(this.start, this.end, segment.start);
      var t2 = new Triangle(this.start, this.end, segment.end);
      var t3 = new Triangle(segment.start, segment.end, this.start);
      var t4 = new Triangle(segment.start, segment.end, this.end);
      var I  = false;
        
      if (t1.getArea() * t2.getArea() < 0 && t1.getArea() * t3.getArea() < 0) {
        I = this.getIntersection(segment);
      }// T4 condition is not required
      return I;
    },
    distance: function() {
      return Infinity;
    },
    middlePoint: function() {
      return false;
    },
    toString: function() {
      return '( ' + this.start.x + ', ' + this.start.y + ' ) -> Infinity';
    }
  });

  return Ray;
});