# CiteVerify dataset preparation report

Generated: 2026-11-19T16:23:54Z

**Status:** `needs_human_review`

## Extraction

- pypdf installed: True (version `6.21.4`)
- Manifest status: `ready`
- Extraction validated against source PDFs: `true`
- PDFs processed: 25
- Distinct papers: 25
- Extracted paper records: 25
- Extracted passages available: 3500
- Extraction errors: 0

## Candidate examples

- Relevance statements/examples: 346
- Evidence statement-passage pairs: 600
- AI/heuristic suggestions: 946 (not ground truth)
- Pending human review: 946
- Human reviewed: 0
- Approved: 0
- Rejected: 0

### Relevance class distribution

```json
{
  "RELEVANT": 300,
  "IRRELEVANT": 46
}
```

### Evidence class distribution

```json
{
  "ENTAILMENT": 301,
  "NEUTRAL": 299
}
```

## Extraction errors

- None

## Quality warnings

- I_Don_t_Think_It_s_a_Scam_A_First_Look_at_Family_Intervention_Barriers_i_2611_24.pdf: extracted_with_warnings.
- Mapping_the_AI_Supply_Chain_Dependencies_Vulnerabilities_and_Market_Conc_2611_24.pdf: extracted_with_warnings.
- Deep_learning_in_bioinformatics_10_1093_bib_bbw068.pdf: extracted_with_warnings.
- Decomposing_SGD_Dynamics_in_Neural_Networks_Teacher_Induced_Spikes_and_V_2611_24.pdf: extracted_with_warnings.
- UltraTex_Aligning_Physical_Knowledge_for_High_Fidelity_PBR_Texture_Gener_2611_24.pdf: extracted_with_warnings.
- BERT_1810.04805.pdf: extracted_with_warnings.
- Knowing_What_You_Know_A_Trait_Theory_of_Reviewer_Value_in_Human_AI_Cogni_2611_24.pdf: extracted_with_warnings.
- ShadowTransfer_A_Geographic_Transfer_Benchmark_for_Overhead_Shadow_Detec_2611_24.pdf: extracted_with_warnings.
- Batch_Dynamic_Coreness_and_Applications_with_Logarithmic_Work_via_Balanc_2611_24.pdf: extracted_with_warnings.
- The_Optimal_Competitive_Ratio_for_Subadditive_Online_Combinatorial_Aucti_2611_24.pdf: extracted_with_warnings.
- Jailbreak_Detection_on_Large_Language_Models_via_Contrastive_Prototype_S_2611_24.pdf: extracted_with_warnings.
- Unified_Law_for_Visual_Tasks_The_Four_Laws_of_Computer_Vision_2611_24917.pdf: extracted_with_warnings.
- Harmonic_Circuit_Chord_Progression_Lies_in_a_Sparse_Principal_Informatio_2611_24.pdf: extracted_with_warnings.
- PrismRestore_A_Compact_Restoration_Toolbox_for_Agentic_Image_Restoration_2611_24.pdf: extracted_with_warnings.
- Grana_Compositional_Reward_Modeling_for_Long_Horizon_Robot_Manipulation_2611_249.pdf: extracted_with_warnings.
- Agentic_Harness_Engineering_Beta_Requirement_Centered_Evolution_of_Agent_2611_24.pdf: extracted_with_warnings.
- What_Survival_Benchmarks_Don_t_Tell_You_Impact_of_Model_Selection_and_Da_2611_24.pdf: extracted_with_warnings.
- A_Sharp_Quadratic_Bound_for_the_Advice_Complexity_of_Selectors_2611_24913.pdf: extracted_with_warnings.
- Z_sight_Unifying_Vision_Language_Action_and_Latent_World_Modeling_2611_24940.pdf: extracted_with_warnings.
- Phoenix_Learning_Scene_Structure_Representations_for_Generalizable_World_2611_24.pdf: extracted_with_warnings.
- Sharp_Complexity_Thresholds_for_Network_Cournot_Competition_2611_24931.pdf: extracted_with_warnings.
- Render_the_Robot_Generate_the_World_One_Video_World_Model_Across_Embodim_2611_24.pdf: extracted_with_warnings.
- Relevance classes with no examples: CANNOT_DETERMINE, PARTIALLY_RELEVANT.
- Evidence classes with no examples: CONTRADICTION.
- 946 candidate row(s) remain pending human review.
- Validation status: needs_human_review.

## Source provenance and extraction

| File | Pages | Text chars | Successful pages | Empty pages | Errors | Status | Title | Source URL | License |
|---|---:|---:|---|---|---|---|---|---|---|
| I_Don_t_Think_It_s_a_Scam_A_First_Look_at_Family_Intervention_Barriers_i_2611_24.pdf | 19 | 106462 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] | [] | [] | extracted_with_warnings | "I Don't Think It's a Scam": A First Look at Family Intervention Barriers in Elder Abuse Discussions on Reddit and Baidu Tieba | https://arxiv.org/abs/2611.24899 | (not supplied) |
| Mapping_the_AI_Supply_Chain_Dependencies_Vulnerabilities_and_Market_Conc_2611_24.pdf | 80 | 229992 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80] | [] | [] | extracted_with_warnings | Mapping the AI Supply Chain: Dependencies, Vulnerabilities, and Market Concentration in the AI Ecosystem | https://arxiv.org/abs/2611.24927 | (not supplied) |
| Deep_learning_in_bioinformatics_10_1093_bib_bbw068.pdf | 46 | 100498 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46] | [] | [] | extracted_with_warnings | Deep learning in bioinformatics | https://openalex.org/W2311607323 | (not supplied) |
| Decomposing_SGD_Dynamics_in_Neural_Networks_Teacher_Induced_Spikes_and_V_2611_24.pdf | 36 | 116448 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36] | [] | [] | extracted_with_warnings | Decomposing SGD Dynamics in Neural Networks: Teacher-Induced Spikes and Variance Inflation | https://arxiv.org/abs/2611.24908 | (not supplied) |
| UltraTex_Aligning_Physical_Knowledge_for_High_Fidelity_PBR_Texture_Gener_2611_24.pdf | 14 | 66091 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] | [] | [] | extracted_with_warnings | UltraTex: Aligning Physical Knowledge for High-Fidelity PBR Texture Generation | https://arxiv.org/abs/2611.24941 | (not supplied) |
| BERT_1810.04805.pdf | 16 | 64112 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] | [] | [] | extracted_with_warnings | BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding | https://arxiv.org/abs/1810.04805 | arXiv nonexclusive-distrib 1.0 |
| Knowing_What_You_Know_A_Trait_Theory_of_Reviewer_Value_in_Human_AI_Cogni_2611_24.pdf | 12 | 40538 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] | [] | [] | extracted_with_warnings | Knowing What You Know: A Trait Theory of Reviewer Value in Human-AI Cognitive Systems | https://arxiv.org/abs/2611.24932 | (not supplied) |
| ShadowTransfer_A_Geographic_Transfer_Benchmark_for_Overhead_Shadow_Detec_2611_24.pdf | 53 | 173789 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53] | [] | [] | extracted_with_warnings | ShadowTransfer: A Geographic Transfer Benchmark for Overhead Shadow Detection | https://arxiv.org/abs/2611.24904 | (not supplied) |
| Batch_Dynamic_Coreness_and_Applications_with_Logarithmic_Work_via_Balanc_2611_24.pdf | 22 | 116751 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22] | [] | [] | extracted_with_warnings | Batch-Dynamic Coreness and Applications with Logarithmic Work via Balanced Pressures | https://arxiv.org/abs/2611.24905 | (not supplied) |
| The_Optimal_Competitive_Ratio_for_Subadditive_Online_Combinatorial_Aucti_2611_24.pdf | 4 | 10723 | [1, 2, 3, 4] | [] | [] | extracted_with_warnings | The Optimal Competitive Ratio for Subadditive Online Combinatorial Auctions is Less Than 1/2 | https://arxiv.org/abs/2611.24920 | (not supplied) |
| Jailbreak_Detection_on_Large_Language_Models_via_Contrastive_Prototype_S_2611_24.pdf | 15 | 59726 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] | [] | [] | extracted_with_warnings | Jailbreak Detection on Large Language Models via Contrastive Prototype Structures | https://arxiv.org/abs/2611.24936 | (not supplied) |
| Unified_Law_for_Visual_Tasks_The_Four_Laws_of_Computer_Vision_2611_24917.pdf | 78 | 246135 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78] | [] | [] | extracted_with_warnings | Unified Law for Visual Tasks (The Four Laws of Computer Vision) | https://arxiv.org/abs/2611.24917 | (not supplied) |
| Harmonic_Circuit_Chord_Progression_Lies_in_a_Sparse_Principal_Informatio_2611_24.pdf | 12 | 37202 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] | [] | [] | extracted_with_warnings | Harmonic Circuit: Chord Progression Lies in a Sparse Principal Information Flow in Symbolic Music Models | https://arxiv.org/abs/2611.24453 | (not supplied) |
| PrismRestore_A_Compact_Restoration_Toolbox_for_Agentic_Image_Restoration_2611_24.pdf | 10 | 45274 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] | [] | [] | extracted_with_warnings | PrismRestore: A Compact Restoration Toolbox for Agentic Image Restoration | https://arxiv.org/abs/2611.24915 | (not supplied) |
| Mine_Locally_Verify_Globally_Exact_Recovery_Compilation_and_Distortion_o_2611_24.pdf | 12 | 71884 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] | [] | [] | extracted | Mine Locally, Verify Globally: Exact Recovery, Compilation, and Distortion of Mined Temporal Rules | https://arxiv.org/abs/2611.24902 | (not supplied) |
| Grana_Compositional_Reward_Modeling_for_Long_Horizon_Robot_Manipulation_2611_249.pdf | 23 | 70082 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] | [] | [] | extracted_with_warnings | Grana: Compositional Reward Modeling for Long-Horizon Robot Manipulation | https://arxiv.org/abs/2611.24926 | (not supplied) |
| Agentic_Harness_Engineering_Beta_Requirement_Centered_Evolution_of_Agent_2611_24.pdf | 47 | 180514 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47] | [] | [] | extracted_with_warnings | Agentic Harness Engineering Beta: Requirement-Centered Evolution of Agent Harnesses | https://arxiv.org/abs/2611.24924 | (not supplied) |
| What_Survival_Benchmarks_Don_t_Tell_You_Impact_of_Model_Selection_and_Da_2611_24.pdf | 46 | 159066 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46] | [] | [] | extracted_with_warnings | What Survival Benchmarks Don't Tell You: Impact of Model Selection and Dataset Regimes | https://arxiv.org/abs/2611.24837 | (not supplied) |
| Hardness_of_Infinite_Energy_Puzzles_2611_24918.pdf | 24 | 53763 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24] | [] | [] | extracted | Hardness of "Infinite Energy" Puzzles | https://arxiv.org/abs/2611.24918 | (not supplied) |
| A_Sharp_Quadratic_Bound_for_the_Advice_Complexity_of_Selectors_2611_24913.pdf | 18 | 55926 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] | [] | [] | extracted_with_warnings | A Sharp Quadratic Bound for the Advice Complexity of Selectors | https://arxiv.org/abs/2611.24913 | (not supplied) |
| Z_sight_Unifying_Vision_Language_Action_and_Latent_World_Modeling_2611_24940.pdf | 21 | 78838 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21] | [] | [] | extracted_with_warnings | $Z$-sight: Unifying Vision-Language-Action and Latent World Modeling | https://arxiv.org/abs/2611.24940 | (not supplied) |
| Phoenix_Learning_Scene_Structure_Representations_for_Generalizable_World_2611_24.pdf | 33 | 114465 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33] | [] | [] | extracted_with_warnings | Phoenix: Learning Scene Structure Representations for Generalizable World-Action Models | https://arxiv.org/abs/2611.24938 | (not supplied) |
| Sharp_Complexity_Thresholds_for_Network_Cournot_Competition_2611_24931.pdf | 26 | 71643 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26] | [] | [] | extracted_with_warnings | Sharp Complexity Thresholds for Network Cournot Competition | https://arxiv.org/abs/2611.24931 | (not supplied) |
| Render_the_Robot_Generate_the_World_One_Video_World_Model_Across_Embodim_2611_24.pdf | 45 | 102922 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45] | [] | [] | extracted_with_warnings | Render the Robot, Generate the World: One Video World Model Across Embodiments | https://arxiv.org/abs/2611.24925 | (not supplied) |
| Prognosis_Without_Prediction_The_Intrinsic_Geometry_of_Survival_2611_24799.pdf | 18 | 36254 | [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] | [] | [] | extracted | Prognosis Without Prediction: The Intrinsic Geometry of Survival | https://arxiv.org/abs/2611.24799 | (not supplied) |

## Recommended next actions

- Complete human annotation for every pending row.
- Re-run validate_annotation.py and generate this report again.
- Run prepare_dataset.py only after the validation report has no blocking errors.
- Train and evaluate; deployment must wait for an independent evaluation report.

## Training readiness

The pilot datasets are not training-ready until every row used for model
selection is human-reviewed, the validation report has no blocking errors,
and `prepare_dataset.py` is run without `--allow-unreviewed`.

Do not claim trained models or metrics before training and independent
evaluation actually complete.
