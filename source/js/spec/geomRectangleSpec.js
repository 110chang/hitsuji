/*
*
*   Spec/geom.Rectangle
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/geom/point',
  'mod/geom/rectangle'
], function(extend, Point, Rectangle) {
  describe("Test case: geom.Rectangle", function() {
    var r, s, P, Q, R, S;

    beforeEach(function () {
      P = new Point(10, 10);
      Q = new Point(20, 20);
      R = new Point(30, 10);
      S = new Point(20, -20);
    });

    it('can create instance.', function() {
      r = new Rectangle(0, 0, 100, 100);
      expect(r instanceof Rectangle).toBeTruthy();

      r = Rectangle(100, 100, 100, 100);
      expect(r instanceof Rectangle).toBeTruthy();
      expect(r.x).toEqual(100);
      expect(r.y).toEqual(100);
      expect(r.width).toEqual(100);
      expect(r.height).toEqual(100);
    });

    it('can knows center point of itself.', function() {
      r = new Rectangle(0, 0, 100, 100);
      expect(r.getCenter()).toEqual(Point(50, 50));
    });

    it('can translate coords.', function() {
      r = new Rectangle(0, 0, 100, 100);
      r.translate(10, 10);
      expect(r.x).toEqual(10);
      expect(r.y).toEqual(10);
    });

    it('knows contain some point in itself.', function() {
      r = new Rectangle(0, 0, 100, 100);
      
      expect(r.contain(P)).toBeTruthy();
      expect(r.contain(S)).toBeFalsy();
      expect(r.contain(Point(50, 50))).toBeTruthy();
    });

    it('knows collapse other rectangle.', function() {
      r = new Rectangle(0, 0, 100, 100);
      s = new Rectangle(50, 50, 100, 100);
      expect(r.collapse(s)).toBeTruthy();

      s = new Rectangle(101, 101, 100, 100);
      expect(r.collapse(s)).toBeFalsy();
    });
  });
});