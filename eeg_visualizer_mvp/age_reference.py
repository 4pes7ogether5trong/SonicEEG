from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

import numpy as np


@dataclass(frozen=True)
class AgeReference:
    """A visual reference scaffold, never a diagnostic normal/abnormal boundary."""

    age_years: float

    def as_dict(self) -> Dict[str, object]:
        age = float(np.clip(self.age_years, 1.0, 100.0))

        # Shape anchors are literature-informed but deliberately not represented
        # as percentile limits. Validation targets include Sun et al. (2023),
        # doi:10.1016/j.neurobiolaging.2023.01.006, and Marcuse et al. (2008),
        # doi:10.1016/j.clinph.2008.02.023.
        anchors = np.array([1.0, 3.0, 8.0, 15.0, 18.0, 40.0, 65.0, 80.0, 100.0])
        pdr = np.array([6.0, 8.0, 9.0, 9.9, 10.0, 10.0, 9.5, 9.0, 8.6])
        organization = np.array([0.25, 0.45, 0.72, 0.96, 1.0, 1.0, 0.92, 0.82, 0.72])
        posterior = float(np.interp(age, anchors, pdr))
        organization_factor = float(np.interp(age, anchors, organization))
        anterior_gap = 7.0 * organization_factor

        targets = {
            "frontopolar": min(18.0, posterior + anterior_gap),
            "frontal": min(18.0, posterior + anterior_gap * 0.72),
            "temporal": max(5.0, posterior - organization_factor),
            "central": posterior + 1.5 * organization_factor,
            "parietal": posterior,
            "posterior-temporal": posterior - 0.5 * organization_factor,
            "occipital": posterior,
            "unknown": posterior,
        }

        return {
            "status": "developmental-visual-scaffold-v0",
            "diagnostic": False,
            "age_years": age,
            "posterior_rhythm_reference_hz": round(posterior, 3),
            "organization_factor": round(organization_factor, 3),
            "regional_frequency_targets_hz": targets,
            "notice": "Comparison geometry only; not validated normative limits.",
        }
