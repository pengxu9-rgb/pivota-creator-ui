"use strict";
const pagePattern=/^\/creator\/pokemon-collector(?:\/(?:shopper|saved|collection|compare|watchlist|coverage|card\/[^/]+))?$/;
module.exports={pagePathAllowed:pathname=>typeof pathname==="string"&&pagePattern.test(pathname)};
