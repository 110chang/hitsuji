/*
*
*   Spec/Extend
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/extend',
  'mod/inherit'
], function(extend, inherit) {
  describe("Test case: Extend", function() {
    var Person, SuperPerson, Hentai, Newtype;

    beforeEach(function () {
      Person = function(name) {
        this.name = name;
      };
      extend(Person.prototype, {
        name: null,
        attack: function() {
          //console.log('attack: 200 damage');
          return 200;
        },
        defence: function() {
          //console.log('defence: 150 damage');
          return 150;
        }
      });
    });

    it('can extend object to the other.', function() {
      SuperPerson = function(name) {
        Person.call(this, name);
      };
      inherit(SuperPerson, Person)
      extend(SuperPerson.prototype, Person.prototype, {
        attack: function() {
          //console.log('attack 300 damage');
          return Person.prototype.attack.call(this) + 300;
        }
      });
      var a = new Person('John');
      expect(a.name).toEqual('John');
      expect(a.attack()).toEqual(200);
      expect(a.defence()).toEqual(150);
      expect(a.constructor).toEqual(Person);
      expect(Person.constructor).toEqual(Function);

      var b = new SuperPerson('Taro');
      expect(b.name).toEqual('Taro');
      expect(b.attack()).toEqual(500);
      expect(a.defence()).toEqual(150);
      expect(b.constructor).toEqual(SuperPerson);
      expect(SuperPerson.constructor).toEqual(Function);
    });

  }); 
});