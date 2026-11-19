# Evaluation reports

`evaluate_models.py` writes timestamped JSON and Markdown reports here. No
report is present yet because no labelled test split or trained model exists.

A report is not proof of production accuracy. Check the test paper count, class
coverage, per-class false-positive/false-negative rates and the confusion matrix.
For evidence verification, inspect false `ENTAILMENT` predictions manually before
deployment.
