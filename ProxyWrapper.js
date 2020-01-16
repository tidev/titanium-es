/**
 * @module Titanium-ES
 *
 * @copyright
 * Copyright (c) 2020 by Axway, Inc. All Rights Reserved.
 *
 * @license
 * Licensed under the terms of the Apache Public License
 * Please see the LICENSE included with this distribution for details.
 */

export default class ProxyWrapper {

    constructor (object) {
    }

    /**
     * Define proxy member types.
     */
    static get TYPE () {
        return {
            PROPERTY: 'property',
            METHOD: 'method'
        };
    }

    /**
     * Print additional information with errors.
     * 
     * @param {String} namespace Namespace where error occured.
     * @param {String} type Type (TYPE.PROPERTY|TYPE.METHOD) that the error occured on.
     * @param {String} name Name of method or property that caused the error.
     */
    static error (namespace, type, name) {
        console.error(`${type.toUpperCase()}: ${name}\nREFERENCE: https://docs.appcelerator.com/platform/latest/#!/api/${namespace}-${type}-${name}`);
    }

    /**
     * Assert type of input.
     * 
     * @param {String} name Name of `input`.
     * @param {Object} input Input object.
     * @param {String} type Type `input` will be validated against.
     * @param {Boolean} optional Allow `input` to be `undefined`.
     */
    static assert (name, input, type, optional) {
        if ((!optional || (optional && input)) && typeof(input) !== type) {
            throw Error(`Invalid type for '${name}', expected '${type}' but received '${typeof(input)}'.`);
        }
    }

    /**
     * Unwrap Titanium-ES proxy into its native proxy.
     * 
     * @param {Object} object Titanium-ES instance object.
     */
    static unwrap (object) {
        if (typeof object === 'object') {
            if (object._object) {
                return object._object;
            }
    
            for (let key in object) {
                if (typeof object[key] === 'object') {
                    if (object[key]._object) {
                        object[key] = object[key]._object;
                    }
                }
            }
        }
    
        return object;
    }
}