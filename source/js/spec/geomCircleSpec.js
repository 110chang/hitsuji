/*
*
*   Spec/geom.Circle
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/geom/point',
  'mod/geom/circle'
], function(extend, Point, Circle) {
  describe("Test case: geom.Circle", function() {
    var c, d, e;

    beforeEach(function () {
      c = new Circle(100, 100, 10);
    });

    it('can create instance', function() {
      expect(c instanceof Circle).toBeTruthy();
      expect(c.x).toEqual(100);
      expect(c.y).toEqual(100);
      expect(c.radius).toEqual(10);
      expect(c.center).toEqual(Point(100, 100));

      d = Circle(200, 200, 5);
      expect(d instanceof Circle).toBeTruthy();
      expect(d.x).toEqual(200);
      expect(d.y).toEqual(200);
      expect(d.radius).toEqual(5);
      expect(d.center).toEqual(Point(200, 200));
    });

    it('can knows own center.', function() {
      expect(c.getCenter()).toEqual(Point(100, 100));
    });

    it('can knows own radius.', function() {
      expect(c.getRadius()).toEqual(10);
    });

    it('can translate itself.', function() {
      c.translate(10, 10);
      expect(c.getCenter()).toEqual(Point(110, 110));

      d = new Circle(200, 200, 5);
      d.translate(-20, -20);
      expect(d.getCenter()).toEqual(Point(180, 180));
    });

    it('can scale itself.', function() {
      c.scale(10);
      expect(c.getRadius()).toEqual(100);

      d = new Circle(200, 200, 5);
      d.scale(5);
      expect(d.getRadius()).toEqual(25);
    });

    it('can knows contain point.', function() {
      var P = new Point(105, 105);
      var Q = new Point(110, 100);
      var R = new Point(111, 100);
      expect(c.contain(P)).toBeTruthy();
      expect(c.contain(Q)).toBeTruthy();
      expect(c.contain(R)).toBeFalsy();

      d = new Circle(200, 200, 5);
      expect(d.contain(P)).toBeFalsy();
    });

    it('can knows collapse other circle.', function() {
      d = new Circle(200, 200, 5);
      expect(c.collapse(d)).toBeFalsy();

      d.translate(-100, -100);
      expect(c.collapse(d)).toBeTruthy();

      e = new Circle(120, 100, 10);
      expect(c.collapse(e)).toBeTruthy();

      e.translate(1, 0);
      expect(c.collapse(e)).toBeFalsy();
    });
  });
});