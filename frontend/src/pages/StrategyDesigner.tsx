import { Card, Table, Button, Modal, Form, Input, InputNumber, Tag, Space, Typography, message } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ExperimentOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { strategyApi } from '../services/api'

const { Title, Paragraph } = Typography

interface StrategyItem {
  id: number
  name: string
  code: string
  description: string
  params: Record<string, any>
  created_at: string
}

export default function StrategyDesigner() {
  const [strategies, setStrategies] = useState<StrategyItem[]>([])
  const [builtin, setBuiltin] = useState<any[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()

  const load = () => {
    strategyApi.list().then(r => setStrategies(r.strategies || []))
    strategyApi.listBuiltin().then(r => setBuiltin(r.strategies || []))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    const values = await form.validateFields()
    // 解析 JSON 参数字段
    if (typeof values.params === 'string' && values.params.trim()) {
      try {
        values.params = JSON.parse(values.params)
      } catch {
        values.params = {}
      }
    }
    await strategyApi.create(values)
    message.success('策略已创建')
    setModalOpen(false)
    form.resetFields()
    load()
  }

  const handleDelete = async (id: number) => {
    await strategyApi.delete(id)
    message.success('已删除')
    load()
  }

  const builtinColumns = [
    { title: '代码', dataIndex: 'code', key: 'code', width: 140 },
    { title: '名称', dataIndex: 'name', key: 'name', width: 140 },
    {
      title: '默认参数', dataIndex: 'default_params', key: 'params',
      render: (params: any) => JSON.stringify(params),
    },
    {
      title: '操作', key: 'actions', width: 120,
      render: (_: any, record: any) => (
        <Tag color="blue" style={{ cursor: 'pointer' }}
          onClick={() => {
            form.setFieldsValue({
              name: record.name,
              code: record.code,
              params: record.default_params,
              description: `内置策略: ${record.name}`,
            })
            setModalOpen(true)
          }}>
          <ExperimentOutlined /> 使用此策略
        </Tag>
      ),
    },
  ]

  const myColumns = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 140 },
    { title: '代码', dataIndex: 'code', key: 'code', width: 140 },
    { title: '描述', dataIndex: 'description', key: 'desc', ellipsis: true },
    {
      title: '参数', dataIndex: 'params', key: 'params',
      render: (p: any) => <code>{JSON.stringify(p)}</code>,
    },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_: any, record: StrategyItem) => (
        <Button type="link" danger icon={<DeleteOutlined />}
          onClick={() => handleDelete(record.id)}>删除</Button>
      ),
    },
  ]

  return (
    <div>
      <Title level={4}>量化策略设计</Title>

      <Card title="内置策略模板" size="small" style={{ marginBottom: 16 }}>
        <Table dataSource={builtin} rowKey="code" columns={builtinColumns} pagination={false} size="small" />
      </Card>

      <Card title="我的策略" size="small"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => {
          form.resetFields()
          setModalOpen(true)
        }}>新建策略</Button>}>
        <Table dataSource={strategies} rowKey="id" columns={myColumns} pagination={false} size="small" />
      </Card>

      <Modal title="新建策略" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="策略名称" rules={[{ required: true }]}>
            <Input placeholder="如: 双均线加强版" />
          </Form.Item>
          <Form.Item name="code" label="策略代码标识" rules={[{ required: true }]}>
            <Input placeholder="如: ma_enhanced" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="params" label="参数 (JSON)">
            <Input.TextArea rows={3} placeholder='{"fast": 10, "slow": 30}' />
          </Form.Item>
        </Form>
        <Paragraph type="secondary" style={{ fontSize: 12 }}>
          💡 内置策略说明：双均线(ma_crossover)、RSI(rsi_reversal)、MACD(macd_cross)
        </Paragraph>
      </Modal>
    </div>
  )
}
