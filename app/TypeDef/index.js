'use strict';

module.exports = (XIBLE, EXPRESS_APP) => {
  const typeDefs = {};

  class TypeDef {
    constructor(obj) {
      if (!obj) {
        throw new Error('Missing object argument');
      }
      if (!obj.name) {
        throw new Error('Missing name property');
      }
      if (obj) {
        Object.assign(this, obj);
      }
    }

    static getAll() {
      return typeDefs;
    }

    static add(typeDef) {
      if (!(typeDef instanceof TypeDef)) {
        typeDef = new TypeDef(typeDef);
      }
      typeDefs[typeDef.name] = typeDef;
    }

    static toJSON() {
      return typeDefs;
    }
  }

  if (EXPRESS_APP) {
    require('./routes.js')(typeDefs, XIBLE, EXPRESS_APP);
  }

  return {
    TypeDef
  };
};