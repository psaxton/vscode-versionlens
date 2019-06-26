/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Peter Flannery. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import appContrib from 'common/appContrib';
import { version } from 'typescript';
const semver = require('semver');

export function nugetGetPackageVersions(packageName) {
  const httpRequest = require('request-light');
  const xmldoc = require('xmldoc');
  const includePrerelease = appContrib.dotnetIncludePrerelease;

  const promises = appContrib.dotnetNuGetFeeds.map(feed => {
    const queryUrl = `${feed}?id=${packageName}&prerelease=${includePrerelease}&semVerLevel=2.0.0`;
    return new Promise(function (resolve, reject) {
      httpRequest.xhr({ url: queryUrl })
        .then(response => {
          if (response.status != 200) {
            reject({
              status: response.status,
              responseText: response.responseText
            });
            return;
          }
  
          const pkg = JSON.parse(response.responseText);
          if (pkg.totalHits == 0)
            reject({ status: 404 });
          else
            resolve(pkg.data.reverse());
        }).catch(reject);
    });
  })
  .concat(appContrib.dotnetNuGetV2Feeds.map(feed => {
    const queryUrl = `${feed}/Packages?$filter=Id eq '${packageName}'`;
    return new Promise(function (resolve, reject) {
      httpRequest.xhr({url: queryUrl })
        .then(response => {
          if (response.status != 200) {
            reject({
              status: response.status,
              responseText: response.responseText
            });
            return;
          }
          const doc = new xmldoc.XmlDocument(response.responseText);
          packageName = packageName

          let entries = doc.childrenNamed("entry");
          if (!includePrerelease) {
            entries = entries.filter(entry => entry.childNamed("m:properties").valueWithPath("d:IsPrerelease") !== "true");
          }
          const versionList = entries.map(entry => entry.childNamed("m:properties").valueWithPath("d:Version"));

          if (versionList.length == 0)
            reject({ status: 404 });
          else
            resolve(versionList);
        }).catch(() => {
          reject(arguments);
        });
    });
  }));



  return Promise.all(promises.map(p => {
    return p.then(
      result => Promise.resolve(result),
      error => Promise.resolve(error)
    );
  })).then(
    results => {
      const dataResults = results.filter(result => Array.isArray(result)).sort((a, b) => semver.gt(a[0], b[0])); // Filter arrays and sort by first/highest version
      if (dataResults.length === 0) return Promise.reject(results[0]); // If no arrays, no successful resolves
      return Promise.resolve(dataResults[0]);
    },
    _ => Promise.reject({ status: 404 })
  )
}