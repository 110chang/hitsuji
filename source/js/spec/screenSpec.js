/*
*
*   Spec/Screen
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/screen'
], function(extend, Screen) {
  describe("Test case: Screen", function() {
    var scr;
    var elm;

    beforeEach(function() {
      scr = new Screen();
      if (elm == null) {
        elm = document.createElement('div');
        elm.setAttribute('id', 'test-element')
        elm.innerHTML = 'HOGEHOGE FUGAFUGA.';
        elm.style.width = '2000px';//scrollable sufficiently large numbers
        elm.style.height = '2000px';//scrollable sufficiently large numbers
        elm.style.backgroundColor = '#FCC';
        document.body.appendChild(elm);
      }
    });

    afterEach(function() {
      if (elm != null) {
        document.body.removeChild(elm);
        elm = null;
      }
    });

    it('can create instance', function() {
      expect(scr instanceof Screen).toBeTruthy();
      expect(Screen() instanceof Screen).toBeTruthy();
    });

    it('can knows screen bounds', function() {
      var scrW = document.documentElement.clientWidth;
      var scrH = document.documentElement.clientHeight;
      //console.log(scrW, scrH);
      expect(Screen().width()).toEqual(scrW);
      expect(Screen().height()).toEqual(scrH);
    });

    it('can knows scroll bounds', function() {
      // necessary to append element to survay 
      var scrW = document.documentElement.scrollWidth;
      var scrH = document.documentElement.scrollHeight;
      //console.log(scrW, scrH);
      expect(Screen().scrollWidth()).toEqual(scrW);
      expect(Screen().scrollHeight()).toEqual(scrH);
      expect(Screen().scrollTop()).toEqual(0);
      expect(Screen().scrollLeft()).toEqual(0);
      window.scrollTo(500, 500);
      expect(Screen().scrollTop()).toEqual(500);
      expect(Screen().scrollLeft()).toEqual(500);
      window.scrollTo(0, 0);
    });

  }); 
});