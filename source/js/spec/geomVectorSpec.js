/*
*
*   Spec/geom.Vector
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/inherit',
  'mod/geom/vector'
], function(extend, inherit, Vector) {
  describe("Test case: geom.Vector", function() {
    var V, W, X, Y;
    var sqrt5 = Math.sqrt(5);
    var dir12 = Math.asin(2 / Math.sqrt(5)) * 180 / Math.PI;
    
    beforeEach(function () {
      V = new Vector();
    });

    it('can create instance', function() {
      expect(V instanceof Vector).toBeTruthy();
      expect(V.x).toEqual(0);
      expect(V.y).toEqual(0);
      expect(V.magnitude).toEqual(0);
      expect(V.direction).toEqual(0);

      W = Vector(1, 2);
      expect(W instanceof Vector).toBeTruthy();
      expect(W.x).toEqual(1);
      expect(W.y).toEqual(2);
      expect(W.magnitude).toEqual(sqrt5);
      expect(W.direction).toEqual(dir12);
    });

    it('knows component variables.', function() {
      V = new Vector(1, 2);
      expect(V.getComponent()).toEqual({ x: 1, y: 2 });
    });

    it('knows polar variables.', function() {
      V = new Vector(1, 2);
      expect(V.getPolar()).toEqual({
        magnitude: sqrt5,
        direction: dir12
      });
    });

    it('can calc add an other vector.', function() {
      V = new Vector(1, 2);
      W = new Vector(3, 4);
      expect(V.add(W)).toEqual(Vector(4, 6));
    });

    it('can calc subtract an other vector.', function() {
      V = new Vector(1, 2);
      W = new Vector(3, 4);
      expect(W.sub(V)).toEqual(Vector(2, 2));
    });

    it('can calc inner product of an other vector.', function() {
      V = new Vector(1, 2);
      W = new Vector(3, 4);
      expect(V.innerProduct(W)).toEqual(1 * 3 + 2 * 4);
    });

    it('can calc cross product of an other vector.', function() {
      V = new Vector(1, 2);
      W = new Vector(3, 4);
      expect(V.crossProduct(W)).toEqual(1 * 4 - 2 * 3);
    });

    it('can calc angle between an other vector.', function() {
      V = new Vector(1, 45, false);
      W = new Vector(1, 90, false);
      expect(V.angleBetween(W)).toBeCloseTo(Math.PI / 4);

      X = new Vector(1, 1);
      Y = new Vector(0, 1);
      expect(X.angleBetween(Y)).toBeCloseTo(Math.PI / 4);
    });

  }); 
});