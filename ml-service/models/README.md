# Model artifacts

Trained weights are intentionally not committed. `registry.json` records active
versions and metadata after training and deployment.

A relevance artifact contains:

```text
relevance-YYYYMMDD-HHMMSS/
  model.joblib
  metadata.json
```

An evidence artifact contains a Hugging Face sequence-classification model:

```text
evidence-YYYYMMDD-HHMMSS/
  config.json
  model.safetensors
  tokenizer.json
  tokenizer_config.json
  metadata.json
  checkpoints/
```

Do not deploy a model just because training finished. Use `evaluate_models.py`
on the independent test split, review false ENTAILMENT predictions, then deploy
through the admin service endpoint.
