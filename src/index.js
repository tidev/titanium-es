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
const ejs = require('ejs');
const fs = require('fs-extra');
const path = require('path');
const { transformSync } = require('@babel/core');

/**
 * Generate Titanium-ES proxy wrappers.
 * 
 * @param apiPath Path to Titanium documentation `api.jsca` file.
 * @param outputDir Directory to output generated proxy wrappers.
 */
exports.generate = async (apiPath, outputDir) => {

    const references = {};
    const namespaces = {};
    const register = new Set();
    const api = JSON.parse(await fs.readFile(apiPath));

    // First pass to gather initial details.
    api.types = api.types.filter(proxy => {

        const namespace = proxy.name.split('.');

        // Remove irrelevant or deprecated proxies.
        if (namespace[0] !== 'Titanium' || proxy.deprecated) {
            return false;
        }

        // Parse properties.
        proxy.properties.filter(property => {

            // Remove deprecated properties.
            if (property.deprecated) {
                return false;
            }

            const type = property.type;
            const name = `${proxy.name}.${property.name}`;

            // List all Titanium proxies referenced by properties.
            if (type.startsWith('Titanium')) {
                if (references[type] && !references[type].includes(name)) {
                    references[type].push(name);
                } else {
                    references[type] = [ name ];
                }
            }

            return true;
        });

        // Parse methods.
        proxy.functions.filter(method => {

            // Remove deprecated properties.
            if (method.deprecated) {
                return false;
            }

            const name = `${proxy.name}.${method.name}`;

            // List all Titanium proxies referenced by methods.
            for (let types of method.returnTypes) {
                let type = types.type;
                if (type.startsWith('Titanium')) {
                    if (references[type] && !references[type].includes(name)) {
                        references[type].push(name);
                    } else {
                        references[type] = [ name ];
                    }
                }
            }

            return true;
        });

        // Include child namespaces in reference list.
        // e.g: Titanium.UI.Window is a child of Titanium.UI
        if (namespace.length > 1) {
            const parent = namespace.slice(0, -1).join('.');
            if (references[parent] && !references[parent].includes(proxy.name)) {
                references[parent].push(proxy.name);
            } else {
                references[parent] = [ proxy.name ];
            }
            if (namespaces[parent] && !namespaces[parent].includes(proxy.name)) {
                namespaces[parent].push(proxy.name);
            } else {
                namespaces[parent] = [ proxy.name ];
            }
        }

        return true;
    });

    // Second pass to process proxies and generate proxy wrappers.
    for (const proxy of api.types) {

        const namespace = proxy.name.split('.');
        const name = namespace.slice(-1)[0];
        const reference = references[proxy.name];
        const data = {
            namespace: proxy.name,
            className: name === 'Titanium' ? `_${name}` : name,
            depth: namespace.length - 1,
            creator: reference && reference.find(r => r.endsWith(`.create${name}`)),
            constants: [],
            properties: [],
            staticProperties: [],
            methods: [],
            staticMethods: [],
            factoryMethods: [],
            modules: []
        };

        // Export namespaces.
        if (namespaces[proxy.name]) {
            for (const module of namespaces[proxy.name]) {
                const moduleNamespace = module.split('.');
                const moduleName = moduleNamespace.slice(-1)[0];
                const modulePath = path.relative(namespace.slice(1, -1).join('/'), moduleNamespace.slice(namespace.length === 1 ? 0 : 1).join('/'));

                const hasModule = !!data.modules.find(m => {
                    if (m.name === moduleName) {
                        m.export = true;
                        return true;
                    }
                    return false;
                });
                if (!hasModule && moduleName !== name) {
                    data.modules.push({
                        name: moduleName,
                        namespace: moduleNamespace,
                        path: modulePath,
                        export: true
                    });
                }
            }
        }

        // Process properties.
        for (const property of proxy.properties) {

            // Handle property type.
            const typeNamespace = property.type.split('.');
            const typeName = typeNamespace.slice(-1)[0];
            const typePath = path.relative(namespace.slice(1, -1).join('/'), typeNamespace.slice(namespace.length === 1 ? 0 : 1).join('/'));

            switch (property.type.toLowerCase()) {
                case 'array':
                    break;
                case 'boolean':
                    break;
                case 'function':
                    break;
                case 'number':
                    break;
                case 'object':
                    break;
                case 'string':
                    break;
                case 'undefined':
                default:

                    // FIXME: ClipboardItemsType is not specififed as an array.
                    if (property.type === 'ClipboardItemsType') {
                        property.type = 'Array';
                        break;
                    }

                    property.definition = property.type;
                    property.type = 'Object';
            }

            // Import referenced Titanium objects/proxies.
            if (typeNamespace[0] === 'Titanium') {
                const hasModule = !!data.modules.find(m => m.name === typeName);
                if (!hasModule && typeName !== name) {
                    data.modules.push({
                        name: typeName,
                        namespace: typeNamespace,
                        path: typePath,
                        export: false
                    });
                }
                property.wrap = typeName;
            }

            // Handle constants.
            if (property.permission === 'read-only') {
                data.constants.push(property);

                // FIXME: There is a grey area with our property implementations
                // where some static properties/methods should really only be instances.
                // So we must provide both accessors.
                data.properties.push(property);

            // Handle instance properties.
            } else if (property.isInstanceProperty) {
                data.properties.push(property);

            // Handle static properties.
            } else {
                data.staticProperties.push(property);

                // FIXME: There is a grey area with our property implementations
                // where some static properties/methods should really only be instances.
                // So we must provide both accessors.
                data.properties.push(property);
            }
        }

        // Process methods.
        for (const method of proxy.functions) {

            const isFactory = method.name.startsWith('create');

            // Create parameter definition.
            let parameterDefinition = '';

            // List parameters to unwrap.
            const unwrap = [];

            // List callback parameter to promisify.
            const promisify = [];

            for (const parameter of method.parameters) {

                // 'default' is a reserved word, rename.
                parameter.name = parameter.name.replace('default', 'def');

                // Construct parameter definition.
                if (parameterDefinition.length) {
                    parameterDefinition += ', ';
                }
                parameterDefinition += parameter.name;

                // Handle parameter type.
                switch (parameter.type.toLowerCase()) {
                    case 'array':
                        break;
                    case 'boolean':
                        break;
                    case 'function':
                        if (parameter.name === 'callback') {

                            // Mark callback as optional for Promise support.
                            parameter.usage = 'optional';
                            promisify.push(parameter.name);
                        }
                        break;
                    case 'number':
                        break;
                    case 'object':
                        unwrap.push(parameter.name);
                        break;
                    case 'string':
                        break;
                    case 'undefined':
                    default:

                        // FIXME: ClipboardItemsType is not specififed as an array.
                        if (parameter.type === 'ClipboardItemsType') {
                            parameter.type = 'Array';
                            break;
                        }

                        // Always unwrap Titanium proxies.
                        if (parameter.type.startsWith('Titanium')) {
                            unwrap.push(parameter.name);
                        }
                        parameter.definition = parameter.type;
                        parameter.type = 'Object';
                }
            }
            method.parameterDefinition = parameterDefinition;
            method.parameterUnwrap = unwrap;
            method.parameterPromisify = promisify;

            // Handle method return type.
            const returnType = method.returnTypes[0].type.replace('_2DMatrix', 'Matrix2D').replace('_3DMatrix', 'Matrix3D');
            const returnTypeNamespace = returnType.split('.');
            const returnTypeName = returnTypeNamespace.slice(-1)[0];
            const returnTypePath = path.relative(namespace.slice(1, -1).join('/'), returnTypeNamespace.slice(1).join('/'));
            const isReturnTypeDeprecated = api.types.find(proxy => proxy.name === returnType);

            // Import referenced Titanium objects/proxies.
            if (returnTypeNamespace[0] === 'Titanium' && (isReturnTypeDeprecated && !isReturnTypeDeprecated.deprecated)) {

                const hasModule = !!data.modules.find(m => {
                    if (m.name === returnTypeName) {
                        m.export = isFactory;
                        return true;
                    }
                    return false;
                });
                if (!hasModule && returnTypeName !== name) {
                    data.modules.push({
                        name: returnTypeName,
                        namespace: returnTypeNamespace,
                        path: returnTypePath,
                        export: isFactory
                    });
                }
                method.wrap = returnTypeName;
            }

            // Handle instance methods.
            if (method.isInstanceProperty) {
                data.methods.push(method);

            // Handle static methods, excluding factories.
            } else if (!isFactory) {
                data.staticMethods.push(method);

                // FIXME: There is a grey area with out method implementations
                // where some static methods should really only be instances.
                // So we must provide both accessors.
                data.methods.push(method);
            }
        }

        // Include all referenced modules so we can register them.
        for (const module of data.modules) {
            register.add(module.namespace.join('.'));
        }

        // Generate proxy wrappers from template.
        const output = ejs.render((await fs.readFile(`${__dirname}/ProxyTemplate.ejs`)).toString(), data);
        const targetDir = path.join(outputDir, namespace.slice(0, -1).join(path.sep));
        const targetPath = path.join(outputDir, namespace.join(path.sep) + '.js');

        await fs.ensureDir(targetDir);
        await fs.writeFile(targetPath, transpile(output));
    }

    // Generate bindings index from template.
    const output = ejs.render((await fs.readFile(`${__dirname}/RegisterTemplate.ejs`)).toString(), { register });
    const targetPath = path.join(outputDir, 'index.js');
    await fs.writeFile(targetPath, transpile(output));

    // Copy over base proxy wrapper.
    await fs.writeFile(path.join(outputDir, 'ProxyWrapper.js'), transpile((await fs.readFile(`${__dirname}/ProxyWrapper.js`)).toString()));
};

function transpile (code) {
    return transformSync(code, {
        presets: [ '@babel/preset-env' ]
    }).code
}