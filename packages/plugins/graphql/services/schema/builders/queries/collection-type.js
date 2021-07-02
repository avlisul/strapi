'use strict';

const { extendType } = require('nexus');
const { set } = require('lodash/fp');

const { buildQuery } = require('../../../old/resolvers-builder');
const { toSingular, toPlural } = require('../../../old/naming');
const { actionExists } = require('../../../old/utils');
const { utils, mappers } = require('../../../types');

const { args } = require('../../../types');

const getFindOneQueryName = contentType => toSingular(utils.getEntityName(contentType));

const getFindQueryName = contentType => toPlural(utils.getEntityName(contentType));

function buildCollectionTypeQueries(contentType) {
  return extendType({
    type: 'Query',

    definition(t) {
      addFindOneQuery(t, contentType);
      addFindQuery(t, contentType);
    },
  });
}

/**
 * Register a "find one" query field to the nexus type definition
 * @param {OutputDefinitionBlock<Query>} t
 * @param contentType
 */
const addFindOneQuery = (t, contentType) => {
  const { uid, modelName, attributes } = contentType;

  const findOneQueryName = getFindOneQueryName(contentType);
  const responseTypeName = utils.getEntityResponseName(contentType);

  const resolverOptions = { resolver: `${uid}.findOne` };

  // If the action doesn't exist, return early and don't add the query
  if (!actionExists(resolverOptions)) {
    return;
  }

  const resolver = buildQuery(toSingular(modelName), resolverOptions);

  // Only authorize filtering using unique fields for findOne queries
  const uniqueAttributes = Object.entries(attributes)
    // Only keep unique scalar attributes
    .filter(([, attribute]) => utils.isScalar(attribute) && attribute.unique)
    // Create a map with the name of the attribute & its filters type
    .reduce((acc, [name, attribute]) => {
      const gqlType = mappers.strapiScalarToGraphQLScalar(attribute.type);
      const filtersType = utils.getScalarFilterInputTypeName(gqlType);

      return set(name, filtersType, acc);
    }, {});

  t.field(findOneQueryName, {
    type: responseTypeName,

    args: {
      id: utils.getScalarFilterInputTypeName('ID'),

      ...uniqueAttributes,
    },

    async resolve(parent, args, context, info) {
      const query = mappers.graphQLFiltersToStrapiQuery(args, contentType);

      const res = await resolver(parent, query, context, info);

      return { data: { id: res.id, attributes: res } };
    },
  });
};

/**
 * Register a "find" query field to the nexus type definition
 * @param {OutputDefinitionBlock<Query>} t
 * @param contentType
 */
const addFindQuery = (t, contentType) => {
  const { uid, modelName } = contentType;

  const findQueryName = getFindQueryName(contentType);
  const responseCollectionTypeName = utils.getEntityResponseCollectionName(contentType);

  const resolverOptions = { resolver: `${uid}.find` };

  // If the action doesn't exist, return early and don't add the query
  if (!actionExists(resolverOptions)) {
    return;
  }

  const resolver = buildQuery(toPlural(modelName), resolverOptions);

  t.field(findQueryName, {
    type: responseCollectionTypeName,

    args: {
      publicationState: args.PublicationStateArg,
      // todo[v4]: to add through i18n plugin
      locale: 'String',
      sort: args.SortArg,
      filters: utils.getFiltersInputTypeName(contentType),
    },

    async resolve(parent, args, context, info) {
      args.filters = mappers.graphQLFiltersToStrapiQuery(args.filters, contentType);

      const res = await resolver(parent, args, context, info);

      return { data: res.map(r => ({ id: r.id, attributes: r })), meta: { pagination: {} } };
    },
  });
};

module.exports = { buildCollectionTypeQueries };
