/*
*
*   Spec/Inherit
*
*   @author Yuji Ito @110chang
*
*/

define([
  'mod/inherit',
  'mod/extend'
], function(inherit, extend) {
  describe("Test case: Inherit", function() {
    var Person, SuperPerson, Hentai, Newtype;

    beforeEach(function () {
      Person = function(name) {
        if (!(this instanceof Person)) {
          return new Person(name);
        }
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

    it('can inherit function object to the other.', function() {
      SuperPerson = function(name) {
        Person.call(this, name);
      };
      inherit(SuperPerson, Person);
      extend(SuperPerson.prototype, {
        //constructor: SuperPerson,
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
      expect(a instanceof Person).toBeTruthy();
      expect(Person.constructor).toEqual(Function);

      var b = new SuperPerson('Taro');
      expect(b.name).toEqual('Taro');
      expect(b.attack()).toEqual(500);
      expect(a.defence()).toEqual(150);
      expect(b.constructor).toEqual(SuperPerson);
      expect(b instanceof Person).toBeTruthy();
      expect(b instanceof SuperPerson).toBeTruthy();
      expect(SuperPerson.constructor).toEqual(Function);
    });

    it('(supplement) create instance when initialize without `new`', function() {
      var jiro = Person('Jiro');
      expect(jiro.name).toEqual('Jiro');
      expect(jiro.attack()).toEqual(200);
      expect(jiro.defence()).toEqual(150);
      expect(jiro.constructor).toEqual(Person);
      expect(jiro instanceof Person).toBeTruthy();
      expect(window.attack).toBeUndefined();
    });

  }); 
});