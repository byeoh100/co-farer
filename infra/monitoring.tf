resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(["workerd", "caddy"])
  name              = "/cofarer/${each.key}"
  retention_in_days = 30
}

resource "aws_sns_topic" "alarms" {
  name = "cofarer-alarms"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alarm_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# The server itself is unhealthy (OS hung, out of memory, disk full…): email.
resource "aws_cloudwatch_metric_alarm" "instance_check" {
  alarm_name          = "cofarer-instance-status-check"
  alarm_description   = "Co-farer's server failed its instance status check."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_Instance"
  dimensions          = { InstanceId = aws_instance.server.id }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

# AWS's hardware under it failed: move to healthy hardware (same disk, same
# address) automatically, and email.
resource "aws_cloudwatch_metric_alarm" "system_check" {
  alarm_name          = "cofarer-system-status-check"
  alarm_description   = "AWS hardware under Co-farer failed; the instance is being recovered."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  dimensions          = { InstanceId = aws_instance.server.id }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_actions       = ["arn:${data.aws_partition.current.partition}:automate:${var.region}:ec2:recover", aws_sns_topic.alarms.arn]
}

# Daily snapshots of the server's disk, kept 7 days.
resource "aws_dlm_lifecycle_policy" "daily" {
  description        = "Co-farer daily disk snapshots - 7 kept"
  execution_role_arn = aws_iam_role.dlm.arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["VOLUME"]
    target_tags    = { Backup = "cofarer-daily" }

    schedule {
      name = "daily"
      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = ["11:00"] # UTC: 3–4 am in California
      }
      retain_rule {
        count = 7
      }
      copy_tags = true
    }
  }
}
