'use strict';
// Metadata-only evaluation. Never treat detector candidates as reviewer confirmation.
function evaluateOccupancyPair(model, reference) {
  if (!model || !reference || model.kind !== 'rhythmic-periodic' || reference.kind !== 'rhythmic-periodic') throw Error('rhythmic-periodic pair required');
  if (model.id !== reference.id || model.localization !== reference.localization || model.state !== reference.state) throw Error('population identity/localization/state mismatch');
  const modes = ['complete','observed-estimate'];
  if (!modes.includes(model.coverage) || !modes.includes(reference.coverage)) return {comparable:false,reason:'unquantified-or-unsupported-coverage'};
  if (model.coverage !== reference.coverage) return {comparable:false,reason:'different-coverage-methods'};
  const n = model.usableSeconds, m = reference.usableSeconds;
  if (!Number.isFinite(n) || !Number.isFinite(m) || n <= 0 || m <= 0 || Math.abs(n-m)>1e-6) return {comparable:false,reason:'different-reviewed-denominators'};
  if (![model.percent,reference.percent].every(x=>Number.isFinite(x)&&x>=0&&x<=100)) return {comparable:false,reason:'invalid-occupancy'};
  if (typeof model.category !== 'string' || typeof reference.category !== 'string') return {comparable:false,reason:'missing-reviewer-category'};
  return {comparable:true,coverage:model.coverage,usableSeconds:n,absolutePercentagePointError:Math.abs(model.percent-reference.percent),categoryAgreement:model.category===reference.category,modelCategory:model.category,referenceCategory:reference.category};
}
module.exports={evaluateOccupancyPair};
