data "aws_vpc" "default" {
  default = true
}

data "aws_subnet" "server" {
  vpc_id            = data.aws_vpc.default.id
  availability_zone = "${var.region}a"
  default_for_az    = true
}

# HTTP and HTTPS in, nothing else. No port 22: access is SSM Session Manager.
resource "aws_security_group" "server" {
  name        = "cofarer-server"
  description = "Co-farer: HTTP/HTTPS only (no SSH)"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.server.id
  description       = "HTTP (Let-s Encrypt challenge, redirect to HTTPS)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.server.id
  description       = "HTTPS"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.server.id
  description       = "Outbound: AWS APIs, Brave, Cognito, Let-s Encrypt, DuckDNS, package updates"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_eip" "server" {
  domain = "vpc"
  tags   = { Name = "cofarer" }
}

resource "aws_eip_association" "server" {
  instance_id   = aws_instance.server.id
  allocation_id = aws_eip.server.id
}
