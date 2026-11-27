"""Service helpers for multi-experiment comparison."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from backend.jobs.manager import metadata_to_dto
from backend.schemas.comparison import (
    ComparisonEpsilonTableDTO,
    ComparisonItemDTO,
    ComparisonResponse,
)
from backend.services.experiment_service import find_experiment_metadata
from dashboard.comparison import (
    ComparisonItem,
    build_comparison_analysis,
    build_comparison_metric_table,
    get_comparison_series_for_plotting,
)
from dashboard.storage import load_experiment_result


def compare_experiments(
    experiment_ids: list[str],
    experiments_dir: Path,
) -> ComparisonResponse:
    """Compare >=2 Completed experiments across matching perturbation radii."""
    items: list[ComparisonItem] = []
    for exp_id in experiment_ids:
        meta = find_experiment_metadata(exp_id, experiments_dir)
        if meta is None:
            raise FileNotFoundError(f"Experiment '{exp_id}' not found")
        if meta.status != "Completed":
            raise ValueError(
                f"Experiment '{exp_id}' has status '{meta.status}'; only Completed experiments can be compared"
            )
        result = load_experiment_result(meta.path)
        items.append(ComparisonItem(metadata=meta, result=result))

    analysis = build_comparison_analysis(items)

    tables = [
        ComparisonEpsilonTableDTO(
            epsilon=float(eps),
            rows=build_comparison_metric_table(analysis, eps),
        )
        for eps in analysis.matching_epsilons
    ]

    raw_series = get_comparison_series_for_plotting(analysis)
    json_experiments: list[dict[str, Any]] = []
    for exp_entry in raw_series.get("experiments", []):
        per_eps_str: dict[str, Any] = {
            f"{float(eps):g}": metrics_dict
            for eps, metrics_dict in exp_entry.get("per_epsilon", {}).items()
        }
        json_experiments.append(
            {
                **exp_entry,
                "per_epsilon": per_eps_str,
            }
        )

    chart_series = {
        "matching_epsilons": [float(e) for e in raw_series.get("matching_epsilons", [])],
        "experiments": json_experiments,
    }

    return ComparisonResponse(
        experiments=[
            ComparisonItemDTO(
                metadata=metadata_to_dto(item.metadata),
                display_label=item.display_label,
            )
            for item in analysis.items
        ],
        matching_epsilons=[float(e) for e in analysis.matching_epsilons],
        all_epsilons=[float(e) for e in analysis.all_epsilons],
        differing_epsilons={
            exp_id: [float(e) for e in eps_tuple]
            for exp_id, eps_tuple in analysis.differing_epsilons.items()
        },
        sample_counts_differ=analysis.sample_counts_differ,
        seeds_differ=analysis.seeds_differ,
        identical_samples=analysis.identical_samples,
        notices=list(analysis.notices),
        tables=tables,
        chart_series=chart_series,
    )
