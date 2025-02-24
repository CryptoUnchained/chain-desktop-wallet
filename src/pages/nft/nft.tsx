import React, { useState, useEffect, useRef } from 'react';
import './nft.less';
import 'antd/dist/antd.css';
import {
  Layout,
  Card,
  Tabs,
  List,
  Avatar,
  // Radio,
  Table,
  Button,
  Form,
  Input,
  Upload,
  Image,
  Spin,
  Tag,
  message,
  notification,
} from 'antd';
import Big from 'big.js';
import Icon, {
  // MenuOutlined,
  // AppstoreOutlined,
  ExclamationCircleOutlined,
  UploadOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useRecoilValue, useRecoilState, useSetRecoilState } from 'recoil';
import ReactPlayer from 'react-player';
import { AddressType } from '@crypto-org-chain/chain-jslib/lib/dist/utils/address';
import axios from 'axios';
import { Promise } from 'bluebird';
import { useTranslation } from 'react-i18next';

import {
  sessionState,
  nftListState,
  fetchingDBState,
  walletAssetState,
  ledgerIsExpertModeState,
} from '../../recoil/atom';

import {
  IPFS_MIDDLEWARE_SERVER_UPLOAD_ENDPOINT,
  FIXED_DEFAULT_FEE,
  NFT_IMAGE_DENOM_SCHEMA,
  NFT_VIDEO_DENOM_SCHEMA,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
} from '../../config/StaticConfig';

import {
  middleEllipsis,
  convertIpfsToHttp,
  sleep,
  useWindowSize,
  getChainName,
} from '../../utils/utils';
import { getUINormalScaleAmount } from '../../utils/NumberUtils';
import { TransactionUtils } from '../../utils/TransactionUtils';
import { NftUtils } from '../../utils/NftUtils';

import { BroadCastResult } from '../../models/Transaction';
import { renderExplorerUrl } from '../../models/Explorer';
import {
  NftType,
  CryptoOrgNftModel,
  CommonNftModel,
  isCryptoOrgNftModel,
  isCronosNftModel,
  CronosCRC721NftModel,
} from '../../models/Nft';

import { walletService } from '../../service/WalletService';
import { detectConditionsError, LEDGER_WALLET_TYPE } from '../../service/LedgerService';
import {
  AnalyticsActions,
  AnalyticsCategory,
  AnalyticsService,
  AnalyticsTxType,
} from '../../service/analytics/AnalyticsService';
import { secretStoreService } from '../../service/storage/SecretStoreService';

import ModalPopup from '../../components/ModalPopup/ModalPopup';
import SuccessModalPopup from '../../components/SuccessModalPopup/SuccessModalPopup';
import ErrorModalPopup from '../../components/ErrorModalPopup/ErrorModalPopup';
import PasswordFormModal from '../../components/PasswordForm/PasswordFormModal';
import ReceiveDetail from '../assets/components/ReceiveDetail';
import { ledgerNotification } from '../../components/LedgerNotification/LedgerNotification';
import ChainSelect from './components/ChainSelect';
import NftPreview from './components/NftPreview';
import NFTTransactionsTab from './tabs/transactions';

import IconTick from '../../svg/IconTick';
import IconPlayer from '../../svg/IconPlayer';
import nftThumbnail from '../../assets/nft-thumbnail.png';

import { useLedgerStatus } from '../../hooks/useLedgerStatus';
import { useCronosEvmAsset, useCronosTendermintAsset } from '../../hooks/useAsset';
import GasStepSelectTendermint, {
  GasInfoTendermint,
} from '../../components/GasCustomize/Tendermint/GasConfig';
import GasStepSelectEVM, { GasInfoEVM } from '../../components/GasCustomize/EVM/GasConfig';

const { Header, Content, Footer, Sider } = Layout;
const { TabPane } = Tabs;
const { Meta } = Card;
const layout = {};
const { TextArea } = Input;

const isVideo = (type: string | undefined) => {
  return type?.indexOf('video') !== -1;
};

const supportedVideo = (mimeType: string | undefined) => {
  switch (mimeType) {
    case 'video/mp4':
      // case 'video/webm':
      // case 'video/ogg':
      // case 'audio/ogg':
      // case 'audio/mpeg':
      return true;
    default:
      return false;
  }
};

const multiplyFee = (fee: string, multiply: number) => {
  return Big(fee)
    .times(multiply)
    .toString();
};

const FormMintNft = () => {
  const [form] = Form.useForm();
  const [formValues, setFormValues] = useState({
    fileList: '',
    tokenId: '',
    denomId: '',
    drop: '',
    description: '',
    senderAddress: '',
    recipientAddress: '',
    data: '',
    uri: '',
    amount: '',
    memo: '',
  });
  const currentSession = useRecoilValue(sessionState);
  const [walletAsset, setWalletAsset] = useRecoilState(walletAssetState);
  const [ledgerIsExpertMode, setLedgerIsExpertMode] = useRecoilState(ledgerIsExpertModeState);
  const setNftList = useSetRecoilState(nftListState);

  const [isConfirmationModalVisible, setIsVisibleConfirmationModal] = useState(false);
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false);
  const [isErrorModalVisible, setIsErrorModalVisible] = useState(false);
  const [isUploadButtonVisible, setIsUploadButtonVisible] = useState(true);
  const [inputPasswordVisible, setInputPasswordVisible] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [isUploadSuccess, setIsUploadSuccess] = useState(false);
  const [isBeforeUpload, setIsBeforeUpload] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDenomIdOwner, setIsDenomIdOwner] = useState(false);
  const [isDenomIdIssued, setIsDenomIdIssued] = useState(false);

  const [ipfsMediaJsonUrl, setIpfsMediaJsonUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [files, setFiles] = useState<any[]>([]);
  const [fileType, setFileType] = useState('');

  const [decryptedPhrase, setDecryptedPhrase] = useState('');
  const [broadcastResult, setBroadcastResult] = useState<BroadCastResult>({});
  const [errorMessages, setErrorMessages] = useState([]);
  const { isLedgerConnected } = useLedgerStatus({ asset: walletAsset });

  const analyticsService = new AnalyticsService(currentSession);

  const [t] = useTranslation();

  const [networkFee, setNetworkFee] = useState(
    currentSession.wallet.config.fee !== undefined &&
      currentSession.wallet.config.fee.networkFee !== undefined
      ? currentSession.wallet.config.fee.networkFee
      : FIXED_DEFAULT_FEE,
  );

  const closeSuccessModal = () => {
    setIsSuccessModalVisible(false);
    setIsVisibleConfirmationModal(false);
  };

  const closeErrorModal = () => {
    setIsErrorModalVisible(false);
  };

  const fileUploadValidator = () => ({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    validator(rule, value) {
      if (files.length === 0) {
        return Promise.reject(new Error(t('nft.fileUploadValidator.error1')));
      }
      if (
        (isUploadSuccess && !isVideo(fileType) && files.length === 1) ||
        (isUploadSuccess && isVideo(fileType) && files.length === 2)
      ) {
        return Promise.resolve();
      }
      // Hide the error before uploading anything
      if (isBeforeUpload) {
        return Promise.reject(new Error(' '));
      }
      // Hide the error when uploading or upload video in progress
      if (isUploading || (files.length === 1 && isVideo(fileType))) {
        return Promise.reject(new Error(' '));
      }
      return Promise.reject(new Error(t('nft.fileUploadValidator.error2')));
    },
  });

  const showConfirmationModal = async () => {
    setInputPasswordVisible(false);
    setIsVisibleConfirmationModal(true);
    setFormValues({
      ...form.getFieldsValue(true),
      senderAddress: currentSession.wallet.address,
      recipientAddress: currentSession.wallet.address,
    });
    const denomData = await walletService.getDenomIdData(form.getFieldValue('denomId'));

    if (denomData) {
      // Denom ID registered
      setIsDenomIdIssued(true);
      if (denomData.denomCreator === currentSession.wallet.address) {
        setIsDenomIdOwner(true);
      } else {
        setIsDenomIdOwner(false);
      }
    } else {
      // Denom ID not registered yet
      setIsDenomIdIssued(false);
      setIsDenomIdOwner(true);
    }
  };

  const showPasswordInput = () => {
    // TODO: check if decryptedPhrase expired
    if ((decryptedPhrase && false) || currentSession.wallet.walletType === LEDGER_WALLET_TYPE) {
      if (!isLedgerConnected && currentSession.wallet.walletType === LEDGER_WALLET_TYPE) {
        ledgerNotification(currentSession.wallet, walletAsset!);
      }
      showConfirmationModal();
    } else {
      setInputPasswordVisible(true);
    }
  };

  const onWalletDecryptFinish = async (password: string) => {
    const phraseDecrypted = await secretStoreService.decryptPhrase(
      password,
      currentSession.wallet.identifier,
    );
    setDecryptedPhrase(phraseDecrypted);
    showConfirmationModal();
  };

  const beforeUpload = file => {
    let error = false;
    const isVideoFile = isVideo(file.type);
    const isSupportedVideo = supportedVideo(file.type);
    const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png';
    const isImageTooLarge = file.size > MAX_IMAGE_SIZE;
    const isVideoTooLarge = file.size > MAX_VIDEO_SIZE;
    if (isVideoFile && !isVideo(fileType)) {
      if (!isSupportedVideo) {
        message.error(`${t('nft.beforeUpload.error1')} MP4 ${t('nft.media.video')}`);
        error = true;
      }
      if (isVideoTooLarge) {
        message.error(`${t('nft.beforeUpload.error2')} 20MB`);
        error = true;
      }
    } else {
      if (!isJpgOrPng) {
        message.error(`${t('nft.beforeUpload.error1')} JPG/PNG ${t('nft.media.image')}`);
        error = true;
      }
      if (isImageTooLarge) {
        message.error(`${t('nft.beforeUpload.error3')} 10MB`);
        error = true;
      }
    }

    if (error) {
      return Upload.LIST_IGNORE;
    }

    return true;
  };

  const handleChange = ({ fileList }) => {
    if (fileList.length === 0) {
      setIsUploadButtonVisible(true);
      setIsUploadSuccess(false);
      setFileType('');
    } else if (fileList.length === 1) {
      if (isVideo(fileList[0].type)) {
        setIsUploadButtonVisible(true);
      } else {
        setIsUploadButtonVisible(false);
      }
      setFileType(fileList[0].type);
    } else {
      setIsUploadButtonVisible(false);
    }
    setIsBeforeUpload(false);
    setFiles(fileList);
  };

  const onMintNft = async () => {
    const { walletType } = currentSession.wallet;
    const memo = formValues.memo !== null && formValues.memo !== undefined ? formValues.memo : '';
    if (!decryptedPhrase && walletType !== LEDGER_WALLET_TYPE) {
      return;
    }
    const data = {
      name: formValues.drop,
      dropId: formValues.drop,
      description: formValues.description,
      image: imageUrl,
      animation_url: isVideo(fileType) ? videoUrl : undefined,
      mimeType: fileType,
    };
    try {
      setConfirmLoading(true);

      if (!isDenomIdIssued) {
        const issueDenomResult = await walletService.broadcastNFTDenomIssueTx({
          denomId: formValues.denomId,
          name: formValues.denomId,
          sender: formValues.senderAddress,
          schema: isVideo(fileType)
            ? JSON.stringify(NFT_VIDEO_DENOM_SCHEMA)
            : JSON.stringify(NFT_IMAGE_DENOM_SCHEMA),
          memo,
          decryptedPhrase,
          asset: walletAsset,
          walletType,
        });

        analyticsService.logTransactionEvent(
          issueDenomResult.transactionHash as string,
          formValues.amount,
          AnalyticsTxType.NftTransaction,
          AnalyticsActions.NftIssue,
          AnalyticsCategory.Nft,
        );

        // eslint-disable-next-line no-console
        console.log('Denom Issue', issueDenomResult);

        // Wait a bit for denom mint sync
        await sleep(4_000);
      }

      const mintNftResult = await walletService.broadcastMintNFT({
        tokenId: formValues.tokenId,
        denomId: formValues.denomId,
        sender: formValues.senderAddress,
        recipient: formValues.recipientAddress,
        data: JSON.stringify(data),
        name: formValues.drop,
        uri: ipfsMediaJsonUrl,
        memo,
        decryptedPhrase,
        asset: walletAsset,
        walletType,
      });

      setBroadcastResult(mintNftResult);

      analyticsService.logTransactionEvent(
        mintNftResult.transactionHash as string,
        formValues.amount,
        AnalyticsTxType.NftTransaction,
        AnalyticsActions.NftMint,
        AnalyticsCategory.Nft,
      );

      setConfirmLoading(false);
      setIsVisibleConfirmationModal(false);
      setIsSuccessModalVisible(true);

      const currentWalletAsset = await walletService.retrieveDefaultWalletAsset(currentSession);
      setWalletAsset(currentWalletAsset);

      const latestLoadedNFTs = await walletService.retrieveNFTs(currentSession.wallet.identifier);
      setNftList(latestLoadedNFTs);

      form.resetFields();
      setIpfsMediaJsonUrl('');
      setImageUrl('');
      setVideoUrl('');
      setFiles([]);
      setFileType('');
      setIsUploadButtonVisible(true);
    } catch (e) {
      if (walletType === LEDGER_WALLET_TYPE) {
        setLedgerIsExpertMode(detectConditionsError(((e as unknown) as any).toString()));
      }

      setErrorMessages(((e as unknown) as any).message.split(': '));
      setIsVisibleConfirmationModal(false);
      setConfirmLoading(false);
      setInputPasswordVisible(false);
      setIsErrorModalVisible(true);
      // eslint-disable-next-line no-console
      console.log('Error occurred while transfer', e);
    }
  };

  const uploadButton = (
    <div>
      <UploadOutlined />
      <div style={{ marginTop: 8 }}>
        {isVideo(fileType) ? (
          <>
            {t('nft.media.thumbnail')}
            <br />
            JPG, PNG
          </>
        ) : (
          <>
            {t('nft.media.image')}: JPG, PNG <br />
            {t('nft.media.video')}: MP4
          </>
        )}
      </div>
    </div>
  );

  const customRequest = async option => {
    const { onProgress, onError, onSuccess, action, file } = option;
    const url = action;
    const isVideoFile = isVideo(file.type);
    const isSupportedVideo = supportedVideo(file.type);
    const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png';
    const formData = new FormData();

    setIsUploading(true);
    // Uploaded Video
    if (files.length >= 2) {
      formData.append('videoFile', files[0].originFileObj);
    }

    if (isVideoFile && isSupportedVideo) {
      setIsUploading(false);
      onSuccess();
      return;
      // eslint-disable-next-line no-else-return
    } else if (isJpgOrPng) {
      formData.append('imageFile', file);
    } else {
      setIsUploading(false);
      setIsUploadSuccess(false);
      onError();
      return;
    }

    try {
      const response = await axios.post(url, formData, {
        onUploadProgress: e => {
          onProgress({ percent: (e.loaded / e.total) * 100 });
        },
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.status === 200) {
        const ipfsUrl = convertIpfsToHttp(response.data.ipfsUrl);
        setIpfsMediaJsonUrl(ipfsUrl);
        const media: any = await axios.get(ipfsUrl);
        setImageUrl(convertIpfsToHttp(media.data.image));
        if (media.data.animation_url) {
          setVideoUrl(convertIpfsToHttp(media.data.animation_url));
        }
        setIsUploadSuccess(true);
        setIsUploading(false);
        onSuccess(response);
      }
    } catch (e) {
      setIsUploadSuccess(false);
      setIsUploading(false);
      onError(e);
      notification.error({
        message: t('nft.notification.uploadFailed.message'),
        description: t('nft.notification.uploadFailed.description'),
        placement: 'topRight',
        duration: 5,
      });
    }
  };

  return (
    <>
      <Form
        {...layout}
        layout="vertical"
        form={form}
        name="control-ref"
        onFinish={showPasswordInput}
        requiredMark={false}
      >
        <Form.Item
          name="denomId"
          label={t('nft.formMintNft.denomId.label')}
          hasFeedback
          validateFirst
          rules={[
            {
              required: true,
              message: `${t('nft.formMintNft.denomId.label')} ${t('general.required')}`,
            },
            {
              min: 3,
              max: 64,
              message: `${t('nft.formMintNft.denomId.error1')} 3 ${t(
                'nft.formMintNft.denomId.error2',
              )} 64 ${t('nft.formMintNft.denomId.error3')}`,
            },
            {
              pattern: /^[a-z]/,
              message: `${t('nft.formMintNft.denomId.error4')}`,
            },
            {
              pattern: /(^[a-z](([a-z0-9]){2,63})$)/,
              message: `${t('nft.formMintNft.denomId.error5')}`,
            },
          ]}
        >
          <Input
            maxLength={64}
            placeholder={`${t('nft.formMintNft.denomId.placeholder')} "denomid123"`}
          />
        </Form.Item>
        <Form.Item
          name="tokenId"
          label={t('nft.formMintNft.tokenId.label')}
          hasFeedback
          validateFirst
          rules={[
            {
              required: true,
              message: `${t('nft.formMintNft.tokenId.label')} ${t('general.required')}`,
            },
            {
              min: 3,
              max: 64,
              message: `${t('nft.formMintNft.tokenId.error1')} 3 ${t(
                'nft.formMintNft.tokenId.error2',
              )} 64 ${t('nft.formMintNft.tokenId.error3')}`,
            },
            {
              pattern: /^[a-z]/,
              message: `${t('nft.formMintNft.tokenId.error4')}`,
            },
            {
              pattern: /(^[a-z](([a-z0-9]){2,63})$)/,
              message: `${t('nft.formMintNft.tokenId.error5')}`,
            },
          ]}
        >
          <Input
            maxLength={64}
            placeholder={`${t('nft.formMintNft.tokenId.placeholder')} "edition123"`}
          />
        </Form.Item>
        <Form.Item
          name="drop"
          label={t('nft.formMintNft.drop.label')}
          hasFeedback
          validateFirst
          rules={[
            {
              required: true,
              message: `${t('nft.formMintNft.drop.label')} ${t('general.required')}`,
            },
          ]}
        >
          <Input
            maxLength={64}
            placeholder={`${t('nft.formMintNft.drop.placeholder')} "Crypto.org Genesis"`}
          />
        </Form.Item>
        <Form.Item
          name="description"
          label={`${t('nft.formMintNft.description.label')}`}
          hasFeedback
        >
          <TextArea
            showCount
            maxLength={1000}
            placeholder={`${t(
              'nft.formMintNft.drop.placeholder',
            )} "Commemorating the launch of the Crypto.org Chain and the Crypto.com NFT Platform..."`}
          />
        </Form.Item>
        <Form.Item
          name="files"
          label={t('nft.formMintNft.files.label')}
          validateFirst
          // hasFeedback
          rules={[fileUploadValidator]}
        >
          <div>
            <Upload
              name="avatar"
              listType="picture-card"
              className="avatar-uploader"
              showUploadList={{
                showPreviewIcon: false,
              }}
              fileList={files}
              customRequest={customRequest}
              action={IPFS_MIDDLEWARE_SERVER_UPLOAD_ENDPOINT}
              beforeUpload={beforeUpload}
              onChange={handleChange}
              accept="audio/*,video/*,image/*"
              onRemove={file => {
                if (isVideo(file.type)) {
                  setVideoUrl('');
                } else {
                  setImageUrl('');
                }
                setIsBeforeUpload(true);
                setIsUploadSuccess(false);
              }}
            >
              {isUploadButtonVisible ? uploadButton : null}
            </Upload>
            {isUploading ? (
              <>
                <Spin
                  spinning
                  indicator={<LoadingOutlined />}
                  style={{ left: 'auto', marginRight: '5px' }}
                />{' '}
                {t('nft.formMintNft.files.description1')}
              </>
            ) : (
              ''
            )}
            {isVideo(fileType) && files.length === 1 ? (
              <>
                <ExclamationCircleOutlined style={{ color: '#1199fa', marginRight: '5px' }} />{' '}
                {t('nft.formMintNft.files.description2')}
              </>
            ) : (
              ''
            )}
          </div>
          <GasStepSelectTendermint
            onChange={(_, fee) => {
              setNetworkFee(fee.toString());
            }}
          />
        </Form.Item>
        <ModalPopup
          isModalVisible={isConfirmationModalVisible}
          handleCancel={() => {
            if (!confirmLoading) {
              setIsVisibleConfirmationModal(false);
            }
          }}
          handleOk={() => {}}
          footer={[
            <Button
              key="submit"
              type="primary"
              onClick={onMintNft}
              loading={confirmLoading}
              disabled={
                (isDenomIdIssued && !isDenomIdOwner) ||
                new Big(multiplyFee(networkFee, !isDenomIdIssued ? 2 : 1)).gt(
                  walletAsset.balance,
                ) ||
                (!isLedgerConnected && currentSession.wallet.walletType === LEDGER_WALLET_TYPE)
              }
            >
              {t('general.confirm')}
            </Button>,
            <Button
              key="back"
              type="link"
              onClick={() => {
                if (!confirmLoading) {
                  setIsVisibleConfirmationModal(false);
                }
              }}
            >
              {t('general.cancel')}
            </Button>,
          ]}
          button={
            <Button htmlType="submit" type="primary" onClick={() => {}}>
              {t('general.review')}
            </Button>
          }
          okText={t('general.confirm')}
          className="nft-mint-modal"
        >
          <>
            <>
              <div className="title">{t('nft.modal1.title')}</div>
              <div className="description">{t('nft.modal1.description')}</div>
              <div className="item">
                <div className="nft-image">
                  <Image
                    style={{ width: '100%', height: '100%' }}
                    src={imageUrl}
                    alt="avatar"
                    placeholder={<Spin spinning indicator={<LoadingOutlined />} />}
                    onError={e => {
                      (e.target as HTMLImageElement).src = nftThumbnail;
                    }}
                  />
                </div>
              </div>
              {isVideo(fileType) ? (
                <div className="item">
                  <div className="nft-video">
                    <ReactPlayer
                      url={videoUrl}
                      config={{
                        file: {
                          attributes: {
                            controlsList: 'nodownload',
                          },
                        },
                      }}
                      controls
                      playing={isConfirmationModalVisible}
                    />
                  </div>
                </div>
              ) : (
                ''
              )}
              <div className="item">
                <div className="label">{t('nft.modal1.label1')}</div>
                <div>{`${formValues.denomId}`}</div>
              </div>
              {isDenomIdIssued && !isDenomIdOwner ? (
                <div className="item notice">
                  <Layout>
                    <Sider width="20px">
                      <ExclamationCircleOutlined style={{ color: '#f27474' }} />
                    </Sider>
                    <Content>{t('nft.modal1.notice1')}</Content>
                  </Layout>
                </div>
              ) : (
                ''
              )}
              <div className="item">
                <div className="label">{t('nft.modal1.label2')}</div>
                <div>{`${formValues.tokenId}`}</div>
              </div>
              <div className="item">
                <div className="label">{t('nft.modal1.label3')}</div>
                <div>{`${formValues.drop}`}</div>
              </div>
              {formValues.description ? (
                <div className="item">
                  <div className="label">{t('nft.modal1.label4')}</div>
                  <div>{`${formValues.description}`}</div>
                </div>
              ) : (
                <></>
              )}
              <div className="item">
                <div className="label">{t('nft.modal1.label5')}</div>
                <div>
                  {getUINormalScaleAmount(
                    multiplyFee(networkFee, !isDenomIdIssued ? 2 : 1),
                    walletAsset.decimals,
                  )}{' '}
                  {walletAsset?.symbol}
                </div>
              </div>
              <GasInfoTendermint />
              {new Big(multiplyFee(networkFee, !isDenomIdIssued ? 2 : 1)).gt(
                walletAsset.balance,
              ) ? (
                  <div className="item notice">
                    <Layout>
                      <Sider width="20px">
                        <ExclamationCircleOutlined style={{ color: '#f27474' }} />
                      </Sider>
                      <Content>
                        {`${t('nft.modal1.notice2')} ${getUINormalScaleAmount(
                          multiplyFee(networkFee, !isDenomIdIssued ? 2 : 1),
                          walletAsset?.decimals,
                        )} ${walletAsset.symbol} ${t('nft.modal1.notice3')}`}
                      </Content>
                    </Layout>
                  </div>
                ) : (
                  ''
                )}
              <div className="item notice">
                <Layout>
                  <Sider width="20px">
                    <ExclamationCircleOutlined style={{ color: '#1199fa' }} />
                  </Sider>
                  <Content>{t('nft.modal1.notice4')}</Content>
                </Layout>
              </div>
            </>
          </>
        </ModalPopup>
      </Form>
      <PasswordFormModal
        description={t('general.passwordFormModal.description')}
        okButtonText={t('general.passwordFormModal.okButton')}
        onCancel={() => {
          setInputPasswordVisible(false);
          // setIsNftTransferModalVisible(true);
        }}
        onSuccess={onWalletDecryptFinish}
        onValidatePassword={async (password: string) => {
          const isValid = await secretStoreService.checkIfPasswordIsValid(password);
          return {
            valid: isValid,
            errMsg: !isValid ? t('general.passwordFormModal.error') : '',
          };
        }}
        successText={t('general.passwordFormModal.success')}
        title={t('general.passwordFormModal.title')}
        visible={inputPasswordVisible}
        successButtonText={t('general.continue')}
      />
      <SuccessModalPopup
        isModalVisible={isSuccessModalVisible}
        handleCancel={closeSuccessModal}
        handleOk={closeSuccessModal}
        title={t('general.successModalPopup.title')}
        button={null}
        footer={[
          <Button key="submit" type="primary" onClick={closeSuccessModal}>
            {t('general.ok')}
          </Button>,
        ]}
      >
        <>
          {broadcastResult?.code !== undefined &&
          broadcastResult?.code !== null &&
          broadcastResult.code === walletService.BROADCAST_TIMEOUT_CODE ? (
              <div className="description">{t('general.successModalPopup.timeout.description')}</div>
            ) : (
              <div className="description">{t('general.successModalPopup.nftMint.description')}</div>
            )}
        </>
      </SuccessModalPopup>
      <ErrorModalPopup
        isModalVisible={isErrorModalVisible}
        handleCancel={closeErrorModal}
        handleOk={closeErrorModal}
        title={t('general.errorModalPopup.title')}
        footer={[]}
      >
        <>
          <div className="description">
            {t('general.errorModalPopup.nftMint.description')}
            <br />
            {errorMessages
              .filter((item, idx) => {
                return errorMessages.indexOf(item) === idx;
              })
              .map((err, idx) => (
                <div key={idx}>- {err}</div>
              ))}
            {ledgerIsExpertMode ? <div>{t('general.errorModalPopup.ledgerExportMode')}</div> : ''}
          </div>
        </>
      </ErrorModalPopup>
    </>
  );
};

const ReceiveTab = () => {
  const currentSession = useRecoilValue(sessionState);
  const cronosTendermintAsset = useCronosTendermintAsset();
  const [currentAsset, setCurrentAsset] = useState(cronosTendermintAsset);

  return (
    <>
      <ChainSelect onChangeAsset={asset => setCurrentAsset(asset)} />
      <ReceiveDetail currentAsset={currentAsset} session={currentSession} isNft />
    </>
  );
};

const NftPage = () => {
  const [form] = Form.useForm();
  const [formValues, setFormValues] = useState({
    tokenId: '',
    tokenContractAddress: '',
    denomId: '',
    senderAddress: '',
    recipientAddress: '',
    nftType: NftType.CRYPTO_ORG,
    amount: '',
    memo: '',
  });
  const [currentSession, setCurrentSession] = useRecoilState(sessionState);
  const [walletAsset, setWalletAsset] = useRecoilState(walletAssetState);
  const [ledgerIsExpertMode, setLedgerIsExpertMode] = useRecoilState(ledgerIsExpertModeState);
  const [nftList, setNftList] = useRecoilState(nftListState);
  const fetchingDB = useRecoilValue(fetchingDBState);

  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false);
  const [isErrorModalVisible, setIsErrorModalVisible] = useState(false);
  const [isNftModalVisible, setIsNftModalVisible] = useState(false);
  const [isNftTransferModalVisible, setIsNftTransferModalVisible] = useState(false);
  const [isNftTransferConfirmVisible, setIsNftTransferConfirmVisible] = useState(false);
  const [inputPasswordVisible, setInputPasswordVisible] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [nft, setNft] = useState<CryptoOrgNftModel | CronosCRC721NftModel | undefined>();
  const [processedNftList, setProcessedNftList] = useState<CommonNftModel[]>([]);
  // const [nftView, setNftView] = useState('grid');

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | undefined>('');

  const [broadcastResult, setBroadcastResult] = useState<BroadCastResult>({});
  const [errorMessages, setErrorMessages] = useState([]);
  const [decryptedPhrase, setDecryptedPhrase] = useState('');
  const { isLedgerConnected } = useLedgerStatus({ asset: walletAsset });

  const didMountRef = useRef(false);

  const analyticsService = new AnalyticsService(currentSession);

  const [t] = useTranslation();

  const cronosTendermintAsset = useCronosTendermintAsset();
  const cronosEvmAsset = useCronosEvmAsset();

  // const nftViewOptions = [
  //   { label: <MenuOutlined />, value: 'list' },
  //   { label: <AppstoreOutlined />, value: 'grid' },
  // ];

  const [networkFee, setNetworkFee] = useState(
    currentSession.wallet.config.fee !== undefined &&
      currentSession.wallet.config.fee.networkFee !== undefined
      ? currentSession.wallet.config.fee.networkFee
      : FIXED_DEFAULT_FEE,
  );

  const size = useWindowSize();

  const handlePageSize = () => {
    if (size.width > 1461) {
      return 10;
    }
    if (size.width > 1096) {
      return 8;
    }
    return 6;
  };

  const closeSuccessModal = () => {
    setIsSuccessModalVisible(false);
    setIsNftModalVisible(false);
    setIsNftTransferConfirmVisible(false);
  };

  const closeErrorModal = () => {
    setIsErrorModalVisible(false);
  };

  const customAddressValidator = TransactionUtils.addressValidator(
    currentSession,
    walletAsset,
    AddressType.USER,
  );

  const showConfirmationModal = () => {
    setInputPasswordVisible(false);
    setIsNftTransferConfirmVisible(true);
    setIsNftTransferModalVisible(true);
    if (isCryptoOrgNftModel(nft)) {
      const { model } = nft;
      setFormValues({
        ...form.getFieldsValue(true),
        denomId: model.denomId,
        tokenId: model.tokenId,
        senderAddress: currentSession.wallet.address,
        tokenContractAddress: '',
        nftType: NftType.CRYPTO_ORG,
      });
    }
    if (isCronosNftModel(nft)) {
      const { model } = nft;
      setFormValues({
        ...form.getFieldsValue(true),
        tokenId: model.token_id,
        tokenContractAddress: model.token_address,
        senderAddress: cronosEvmAsset?.address,
        nftType: NftType.CRC_721_TOKEN,
      });
    }
  };

  const showPasswordInput = () => {
    // TODO: check if decryptedPhrase expired
    if ((decryptedPhrase && false) || currentSession.wallet.walletType === LEDGER_WALLET_TYPE) {
      if (!isLedgerConnected && currentSession.wallet.walletType === LEDGER_WALLET_TYPE) {
        ledgerNotification(currentSession.wallet, walletAsset!);
      }
      showConfirmationModal();
    } else {
      setInputPasswordVisible(true);
      setIsNftTransferModalVisible(false);
    }
  };

  const onWalletDecryptFinish = async (password: string) => {
    const phraseDecrypted = await secretStoreService.decryptPhrase(
      password,
      currentSession.wallet.identifier,
    );
    setDecryptedPhrase(phraseDecrypted);
    showConfirmationModal();
  };

  const onConfirmTransfer = async () => {
    const { walletType } = currentSession.wallet;
    const memo = formValues.memo !== null && formValues.memo !== undefined ? formValues.memo : '';
    if (!decryptedPhrase && walletType !== LEDGER_WALLET_TYPE) {
      return;
    }
    try {
      setConfirmLoading(true);

      const sendResult = await walletService.sendNFT({
        tokenId: formValues.tokenId,
        tokenContractAddress: formValues.tokenContractAddress,
        denomId: formValues.denomId,
        sender: formValues.senderAddress,
        recipient: formValues.recipientAddress,
        memo,
        decryptedPhrase,
        asset: walletAsset,
        walletType,
        nftType: formValues.nftType,
      });

      analyticsService.logTransactionEvent(
        sendResult.transactionHash as string,
        formValues.amount,
        AnalyticsTxType.NftTransaction,
        AnalyticsActions.NftTransfer,
        AnalyticsCategory.Nft,
      );

      const latestLoadedNFTs = await walletService.retrieveNFTs(currentSession.wallet.identifier);
      setNftList(latestLoadedNFTs);
      const processedNFTsLists = await NftUtils.groupAllNftList(latestLoadedNFTs);
      setProcessedNftList(processedNFTsLists);

      setBroadcastResult(sendResult);

      setIsNftModalVisible(false);
      setIsNftTransferModalVisible(false);
      setIsNftTransferConfirmVisible(false);
      setConfirmLoading(false);

      setIsSuccessModalVisible(true);
      setInputPasswordVisible(false);

      const currentWalletAsset = await walletService.retrieveDefaultWalletAsset(currentSession);
      setWalletAsset(currentWalletAsset);

      form.resetFields();
    } catch (e) {
      if (walletType === LEDGER_WALLET_TYPE) {
        setLedgerIsExpertMode(detectConditionsError(((e as unknown) as any).toString()));
      }

      setErrorMessages(((e as unknown) as any).message.split(': '));
      setIsNftModalVisible(false);
      setConfirmLoading(false);
      setInputPasswordVisible(false);
      setIsErrorModalVisible(true);
      // eslint-disable-next-line no-console
      console.log('Error occurred while transfer', e);
    }
  };

  useEffect(() => {
    const fetchNftList = async () => {
      const currentNftList = await NftUtils.groupAllNftList(nftList);
      setProcessedNftList(currentNftList);
    };

    fetchNftList();

    if (!didMountRef.current) {
      didMountRef.current = true;
      analyticsService.logPage('NFT');
      setCurrentSession({
        ...currentSession,
        activeAsset: cronosTendermintAsset,
      });
    }
  }, [fetchingDB, nftList]);

  // const NftColumns = [
  //   {
  //     title: t('nft.nftCollection.table1.name'),
  //     key: 'name',
  //     render: record => {
  //       const { drop, name } = record.tokenData;
  //       return name || drop ? name || drop : 'n.a.';
  //     },
  //   },
  //   {
  //     title: t('nft.nftCollection.table1.denomId'),
  //     key: 'denomId',
  //     render: record => {
  //       return record.denomId;
  //     },
  //   },
  //   {
  //     title: t('nft.nftCollection.table1.tokenId'),
  //     key: 'tokenId',
  //     render: record => {
  //       return record.tokenId;
  //     },
  //   },
  //   {
  //     title: t('nft.nftCollection.table1.creator'),
  //     key: 'creator',
  //     render: record => {
  //       return (
  //         <a
  //           data-original={record.tokenMinter}
  //           target="_blank"
  //           rel="noreferrer"
  //           href={`${renderExplorerUrl(currentSession.wallet.config, 'address')}/${
  //             record.tokenMinter
  //           }`}
  //         >
  //           {middleEllipsis(record.tokenMinter, 8)}
  //         </a>
  //       );
  //     },
  //   },
  //   {
  //     title: t('nft.nftCollection.table1.viewAction'),
  //     key: 'viewAction',
  //     render: record => {
  //       return (
  //         <a
  //           onClick={() => {
  //             setNft(record);
  //             setVideoUrl(record?.tokenData.animation_url || record?.tokenData.animationUrl);
  //             setIsVideoPlaying(true);
  //             setIsNftModalVisible(true);
  //           }}
  //         >
  //           {t('nft.nftCollection.table1.action1')}
  //         </a>
  //       );
  //     },
  //   },
  // ];

  const NftAttributeTableColumns = [
    {
      title: t('nft.detailModal.traitType'),
      // dataIndex: 'traitType',
      key: 'traitType',
      render: record => {
        return record.trait_type || record.traitType;
      },
    },
    {
      title: t('nft.detailModal.value'),
      dataIndex: 'value',
      key: 'value',
    },
  ];

  return (
    <Layout className="site-layout">
      <Header className="site-layout-background">{t('nft.title')}</Header>
      <div className="header-description">{t('nft.description')}</div>
      <Content>
        <Tabs defaultActiveKey="1">
          <TabPane tab={t('nft.tab1')} key="1">
            <div className="site-layout-background nft-content">
              {/* <div className="view-selection">
                <Radio.Group
                  options={nftViewOptions}
                  defaultValue="grid"
                  onChange={(e) => {
                    setNftView(e.target.value);
                  }}
                  optionType="button"
                />
              </div> */}
              {/* {nftView === 'grid' ? ( */}
              <List
                grid={{
                  gutter: 16,
                  xs: 1,
                  sm: 2,
                  md: 3,
                  lg: 3,
                  xl: 4,
                  xxl: 5,
                }}
                dataSource={processedNftList}
                renderItem={item => {
                  if (isCryptoOrgNftModel(item)) {
                    const { model, tokenData } = item;
                    return (
                      <List.Item>
                        <Card
                          style={{ width: 200 }}
                          cover={
                            <>
                              <NftPreview
                                nft={item}
                                videoUrl={videoUrl}
                                isVideoPlaying={isVideoPlaying}
                              />
                              {supportedVideo(tokenData?.mimeType) ||
                              supportedVideo(tokenData?.animationMimeType) ? (
                                  <Icon component={IconPlayer} />
                                ) : (
                                  ''
                                )}
                            </>
                          }
                          hoverable
                          onClick={() => {
                            setNft(item);
                            setVideoUrl(tokenData?.animation_url || tokenData?.animationUrl);
                            setIsVideoPlaying(true);
                            setIsNftModalVisible(true);
                            setWalletAsset(cronosTendermintAsset!);
                          }}
                          className="nft"
                        >
                          <Meta
                            title={NftUtils.renderNftTitle(item, 20)}
                            description={
                              <>
                                <Avatar
                                  style={{
                                    background: NftUtils.generateLinearGradientByAddress(
                                      model.tokenMinter,
                                    ),
                                    verticalAlign: 'middle',
                                  }}
                                />
                                {middleEllipsis(model.tokenMinter, 6)}{' '}
                                {model.isMintedByCDC ? <IconTick style={{ height: '12px' }} /> : ''}
                              </>
                            }
                          />
                        </Card>
                      </List.Item>
                    );
                  }
                  if (isCronosNftModel(item)) {
                    const { model } = item;
                    return (
                      <List.Item>
                        <Card
                          style={{ width: 200 }}
                          cover={
                            <NftPreview
                              nft={item}
                              videoUrl={videoUrl}
                              isVideoPlaying={isVideoPlaying}
                            />
                          }
                          hoverable
                          onClick={() => {
                            setNft(item);
                            setVideoUrl('');
                            setIsNftModalVisible(true);
                            setWalletAsset(cronosEvmAsset!);
                          }}
                          className="nft"
                        >
                          <Meta
                            title={NftUtils.renderNftTitle(item, 20)}
                            description={
                              <>
                                <Avatar
                                  style={{
                                    background: NftUtils.generateLinearGradientByAddress(
                                      model.token_address ?? (model.contract_address ?? ''),
                                    ),
                                    verticalAlign: 'middle',
                                  }}
                                />
                                {middleEllipsis(model.token_address ?? '', 6)}{' '}
                              </>
                            }
                          />
                        </Card>
                      </List.Item>
                    );
                  }
                  return <></>;
                }}
                pagination={{
                  pageSize: handlePageSize(),
                }}
                loading={fetchingDB}
              />
              {/* ) : (
                <Table
                  locale={{
                    triggerDesc: t('general.table.triggerDesc'),
                    triggerAsc: t('general.table.triggerAsc'),
                    cancelSort: t('general.table.cancelSort'),
                  }}
                  columns={NftColumns}
                  dataSource={processedNftList}
                />
              )} */}
            </div>
            <>
              <ModalPopup
                isModalVisible={isNftModalVisible}
                handleCancel={() => {
                  // Stop the video when closing
                  setIsVideoPlaying(false);
                  setVideoUrl(undefined);
                  setTimeout(() => {
                    setIsNftModalVisible(false);
                  }, 10);
                }}
                handleOk={() => {}}
                footer={[]}
                okText="Confirm"
                className="nft-modal"
              >
                <Layout className="nft-detail">
                  <Content>
                    <div className="nft-image">
                      <NftPreview
                        nft={nft}
                        showThumbnail={false}
                        videoUrl={videoUrl}
                        isVideoPlaying={isVideoPlaying}
                      />
                    </div>
                  </Content>
                  <Sider width="50%">
                    {isCryptoOrgNftModel(nft) && (
                      <>
                        <div className="title">{NftUtils.renderNftTitle(nft)}</div>
                        <div className="item">
                          <div className="description">
                            <Tag style={{ border: 'none', padding: '5px 14px' }} color="processing">
                              {getChainName(
                                cronosTendermintAsset?.name,
                                currentSession.wallet.config,
                              )}
                            </Tag>
                          </div>
                        </div>
                        <div className="item">
                          <Meta
                            description={
                              <>
                                <Avatar
                                  style={{
                                    background: NftUtils.generateLinearGradientByAddress(
                                      nft.model.tokenMinter,
                                    ),
                                    verticalAlign: 'middle',
                                  }}
                                />
                                <>
                                  <a
                                    data-original={nft?.model.tokenMinter}
                                    target="_blank"
                                    rel="noreferrer"
                                    href={`${renderExplorerUrl(
                                      currentSession.wallet.config,
                                      'address',
                                    )}/${nft?.model.tokenMinter}`}
                                  >
                                    {nft?.model.tokenMinter}
                                  </a>
                                  {nft?.model.isMintedByCDC ? (
                                    <IconTick style={{ height: '12px' }} />
                                  ) : (
                                    ''
                                  )}
                                </>
                              </>
                            }
                          />
                        </div>
                        <div className="item">
                          <div className="subtitle">{t('nft.detailModal.subtitle')}</div>
                          <div className="description">
                            {nft?.tokenData?.description ? nft?.tokenData.description : 'n.a.'}
                          </div>
                        </div>
                        <div className="item">
                          <div className="subtitle">{t('nft.detailModal.attributes')}</div>
                          <div className="attribute">
                            {nft?.tokenData?.attributes ? (
                              <Table
                                className="nft-attribute-table"
                                dataSource={nft.tokenData.attributes}
                                columns={NftAttributeTableColumns}
                                pagination={false}
                                size="small"
                                rowKey={record => `${record.traitType}-${record.value}`}
                              />
                            ) : (
                              <div className="description">n.a.</div>
                            )}
                          </div>
                        </div>

                        <div className="item">
                          <div className="table-row">
                            <div>{t('nft.detailModal.label1')}</div>
                            <div>{nft?.model.denomId}</div>
                          </div>
                          <div className="table-row">
                            <div>{t('nft.detailModal.label2')}</div>
                            <div>{nft?.model.denomName}</div>
                          </div>
                          <div className="table-row">
                            <div>{t('nft.detailModal.label3')}</div>
                            <div>
                              <a
                                data-original={nft?.model.tokenId}
                                target="_blank"
                                rel="noreferrer"
                                href={`${renderExplorerUrl(
                                  currentSession.wallet.config,
                                  'nft',
                                )}/nfts/tokens/${nft?.model.denomId}/${nft?.model.tokenId}`}
                              >
                                {nft?.model.tokenId}
                              </a>
                            </div>
                          </div>
                          {nft?.tokenData?.mimeType ? (
                            <div className="table-row">
                              <div>{t('nft.detailModal.label4')}</div>
                              <a
                                data-original={nft?.model.denomId}
                                target="_blank"
                                rel="noreferrer"
                                href={
                                  supportedVideo(nft?.tokenData.mimeType) ||
                                  supportedVideo(nft?.tokenData.animationMimeType)
                                    ? nft?.tokenData.animation_url || nft?.tokenData.animationUrl
                                    : nft?.tokenData.image
                                }
                              >
                                {supportedVideo(nft?.tokenData.mimeType) ||
                                supportedVideo(nft?.tokenData.animationMimeType)
                                  ? nft?.tokenData.animation_url || nft?.tokenData.animationUrl
                                  : nft?.tokenData.image}
                              </a>
                            </div>
                          ) : (
                            ''
                          )}
                        </div>
                        <div className="item">
                          <Button
                            key="submit"
                            type="primary"
                            onClick={() => {
                              setIsNftTransferModalVisible(true);
                              setIsNftModalVisible(false);
                            }}
                          >
                            {t('nft.detailModal.button1')}
                          </Button>
                        </div>
                        <div className="item goto-marketplace">
                          {nft?.model.marketplaceLink !== '' ? (
                            <a
                              data-original={nft?.model.denomName}
                              target="_blank"
                              rel="noreferrer"
                              href={nft?.model.marketplaceLink}
                            >
                              {t('nft.detailModal.button2')}
                            </a>
                          ) : (
                            ''
                          )}
                        </div>
                      </>
                    )}
                    {isCronosNftModel(nft) && (
                      <>
                        <div className="title">{NftUtils.renderNftTitle(nft)}</div>
                        <div className="item">
                          <div className="description">
                            <Tag style={{ border: 'none', padding: '5px 14px' }} color="processing">
                              {getChainName(cronosEvmAsset?.name, currentSession.wallet.config)}
                            </Tag>
                          </div>
                        </div>
                        <div className="item">
                          <Meta
                            description={
                              <>
                                <Avatar
                                  style={{
                                    background: NftUtils.generateLinearGradientByAddress(
                                      nft.model.token_address ?? '',
                                    ),
                                    verticalAlign: 'middle',
                                  }}
                                />
                                <>
                                  <a
                                    data-original={nft?.model.token_address}
                                    target="_blank"
                                    rel="noreferrer"
                                    href={`${renderExplorerUrl(
                                      cronosEvmAsset?.config,
                                      'address',
                                    )}/${nft?.model.token_address}`}
                                  >
                                    {nft?.model.token_address}
                                  </a>
                                </>
                              </>
                            }
                          />
                        </div>
                        <div className="item">
                          <div className="subtitle">{t('nft.detailModal.subtitle')}</div>
                          <div className="description">
                            {nft?.model?.description ? nft?.model.description : 'n.a.'}
                          </div>
                        </div>
                        <div className="item">
                          <div className="subtitle">{t('nft.detailModal.attributes')}</div>
                          <div className="attribute">
                            {nft?.model.attributes ? (
                              <Table
                                className="nft-attribute-table"
                                dataSource={nft.model.attributes}
                                columns={NftAttributeTableColumns}
                                pagination={false}
                                size="small"
                                rowKey={record => `${record.trait_type}-${record.value}`}
                              />
                            ) : (
                              <div className="description">n.a.</div>
                            )}
                          </div>
                        </div>

                        <div className="item">
                          {/* <div className="table-row">
                            <div>{t('nft.detailModal.label1')}</div>
                            <div>{nft?.model.denomId}</div>
                          </div> */}
                          <div className="table-row">
                            <div>{t('nft.detailModal.label5')}</div>
                            <div>{nft?.model.name}</div>
                          </div>
                          <div className="table-row">
                            <div>{t('nft.detailModal.label3')}</div>
                            <div>{nft?.model.token_id}</div>
                          </div>
                          {/* {nft?.tokenData?.mimeType ? (
                            <div className="table-row">
                              <div>{t('nft.detailModal.label4')}</div>
                              <a
                                data-original={nft?.model.denomId}
                                target="_blank"
                                rel="noreferrer"
                                href={
                                  supportedVideo(nft?.tokenData.mimeType) ||
                                  supportedVideo(nft?.tokenData.animationMimeType)
                                    ? nft?.tokenData.animation_url || nft?.tokenData.animationUrl
                                    : nft?.tokenData.image
                                }
                              >
                                {supportedVideo(nft?.tokenData.mimeType) ||
                                supportedVideo(nft?.tokenData.animationMimeType)
                                  ? nft?.tokenData.animation_url || nft?.tokenData.animationUrl
                                  : nft?.tokenData.image}
                              </a>
                            </div>
                          ) : (
                            ''
                          )} */}
                        </div>
                        <div className="item">
                          <Button
                            key="submit"
                            type="primary"
                            onClick={() => {
                              setIsNftTransferModalVisible(true);
                              setIsNftModalVisible(false);
                            }}
                          >
                            {t('nft.detailModal.button1')}
                          </Button>
                        </div>
                        {/* <div className="item goto-marketplace">
                          {nft?.model.marketplaceLink !== '' ? (
                            <a
                              data-original={nft?.model.denomName}
                              target="_blank"
                              rel="noreferrer"
                              href={nft?.model.marketplaceLink}
                            >
                              {t('nft.detailModal.button2')}
                            </a>
                          ) : (
                            ''
                          )}
                        </div> */}
                      </>
                    )}
                  </Sider>
                </Layout>
              </ModalPopup>
              <ModalPopup
                isModalVisible={isNftTransferModalVisible}
                handleCancel={() => {
                  setIsNftTransferModalVisible(false);
                  setIsNftTransferConfirmVisible(false);
                  setIsNftModalVisible(true);
                  form.resetFields();
                }}
                handleOk={() => {}}
                footer={[
                  isNftTransferConfirmVisible ? (
                    <Button
                      key="submit"
                      type="primary"
                      onClick={onConfirmTransfer}
                      disabled={
                        !isLedgerConnected &&
                        currentSession.wallet.walletType === LEDGER_WALLET_TYPE
                      }
                      loading={confirmLoading}
                    >
                      {t('nft.modal2.button1')}
                    </Button>
                  ) : (
                    <Button
                      key="submit"
                      type="primary"
                      htmlType="submit"
                      disabled={new Big(networkFee).gt(walletAsset?.balance ?? 0)}
                      onClick={() => {
                        form.submit();
                      }}
                    >
                      {t('general.continue')}
                    </Button>
                  ),
                  <Button
                    key="back"
                    type="link"
                    onClick={() => {
                      if (isNftTransferConfirmVisible) {
                        setIsNftTransferConfirmVisible(false);
                      } else {
                        setIsNftTransferModalVisible(false);
                        setIsNftModalVisible(true);
                        form.resetFields();
                      }
                    }}
                  >
                    {t('general.cancel')}
                  </Button>,
                ]}
                okText="Confirm"
                className="nft-transfer-modal"
              >
                <>
                  {isNftTransferConfirmVisible ? (
                    <>
                      <div className="title">{t('nft.modal2.title')}</div>
                      <div className="description">{t('nft.modal2.description')}</div>
                      <div className="item">
                        <div className="nft-image">
                          <NftPreview
                            nft={nft}
                            videoUrl={videoUrl}
                            isVideoPlaying={isVideoPlaying}
                          />
                        </div>
                      </div>
                      <div className="item">
                        <div className="label">{t('nft.modal2.label1')}</div>
                        <div className="address">{`${form.getFieldValue('recipientAddress')}`}</div>
                      </div>
                      <div className="item notice">
                        <Layout>
                          <Sider width="20px">
                            <ExclamationCircleOutlined style={{ color: '#1199fa' }} />
                          </Sider>
                          <Content>
                            {t('nft.modal2.notice1', {
                              chainName: getChainName(
                                walletAsset?.name,
                                currentSession.wallet.config,
                              ),
                            })}
                          </Content>
                        </Layout>
                      </div>
                      <div className="item notice">
                        <Layout>
                          <Sider width="20px">
                            <ExclamationCircleOutlined style={{ color: '#1199fa' }} />
                          </Sider>
                          <Content>{t('nft.modal2.notice2')}</Content>
                        </Layout>
                      </div>
                      {formValues.nftType === NftType.CRYPTO_ORG && (
                        <div className="item">
                          <div className="label">{t('nft.modal2.label2')}</div>
                          <div>{`${formValues.denomId}`}</div>
                        </div>
                      )}
                      {formValues.nftType === NftType.CRC_721_TOKEN && (
                        <div className="item">
                          <div className="label">{t('nft.modal2.label5')}</div>
                          <div>{`${formValues.tokenContractAddress}`}</div>
                        </div>
                      )}
                      <div className="item">
                        <div className="label">{t('nft.modal2.label3')}</div>
                        <div>{`${formValues.tokenId}`}</div>
                      </div>
                      {formValues.nftType === NftType.CRYPTO_ORG && (
                        <>
                          <div className="item">
                            <div className="label">{t('nft.modal2.label4')}</div>
                            <div>
                              {getUINormalScaleAmount(networkFee, walletAsset.decimals)}{' '}
                              {walletAsset.symbol}
                            </div>
                          </div>
                          <GasInfoTendermint />
                        </>
                      )}
                      {formValues.nftType === NftType.CRC_721_TOKEN && <GasInfoEVM asset={cronosEvmAsset!} />}
                    </>
                  ) : (
                    <>
                      <div className="title">{t('nft.modal3.title')}</div>
                      <div className="description">{t('nft.modal3.description')}</div>
                      <div className="item">
                        <div className="nft-image">
                          <NftPreview
                            nft={nft}
                            videoUrl={videoUrl}
                            isVideoPlaying={isVideoPlaying}
                          />
                        </div>
                      </div>
                      <div className="item">
                        <div className="label">{t('nft.modal3.label1')}</div>
                        <div className="address">{NftUtils.renderNftTitle(nft)}</div>
                      </div>
                      <Form
                        {...layout}
                        layout="vertical"
                        form={form}
                        name="control-ref"
                        onFinish={showPasswordInput}
                        requiredMark={false}
                      >
                        <Form.Item
                          name="recipientAddress"
                          label={t('nft.modal3.form.recipientAddress.label')}
                          hasFeedback
                          validateFirst
                          rules={[
                            {
                              required: true,
                              message: `${t('nft.modal3.form.recipientAddress.label')} ${t(
                                'general.required',
                              )}`,
                            },
                            customAddressValidator,
                          ]}
                        >
                          <Input placeholder={t('nft.modal3.form.recipientAddress.placeholder')} />
                        </Form.Item>
                        {isCryptoOrgNftModel(nft) && (
                          <GasStepSelectTendermint
                            onChange={(_, fee) => {
                              setNetworkFee(fee.toString());
                            }}
                          />
                        )}
                        {isCronosNftModel(nft) && (
                          <GasStepSelectEVM
                            asset={cronosEvmAsset!}
                            onChange={(_, fee) => {
                              setNetworkFee(fee.toString());
                            }}
                          />
                        )}
                      </Form>
                      {new Big(networkFee).gt(walletAsset?.balance ?? 0) ? (
                        <div className="item notice">
                          <Layout>
                            <Sider width="20px">
                              <ExclamationCircleOutlined style={{ color: '#1199fa' }} />
                            </Sider>
                            <Content>
                              {`${t('nft.modal1.notice2')} ${getUINormalScaleAmount(
                                networkFee,
                                walletAsset?.decimals,
                              )} ${walletAsset?.symbol} ${t('nft.modal1.notice3')}`}
                            </Content>
                          </Layout>
                        </div>
                      ) : (
                        ''
                      )}
                      <div className="item notice">
                        <Layout>
                          <Sider width="20px">
                            <ExclamationCircleOutlined style={{ color: '#1199fa' }} />
                          </Sider>
                          <Content>
                            {t('nft.modal2.notice1', {
                              chainName: getChainName(
                                walletAsset?.name,
                                currentSession.wallet.config,
                              ),
                            })}
                          </Content>
                        </Layout>
                      </div>
                      <div className="item notice">
                        <Layout>
                          <Sider width="20px">
                            <ExclamationCircleOutlined style={{ color: '#1199fa' }} />
                          </Sider>
                          <Content>{t('nft.modal2.notice2')}</Content>
                        </Layout>
                      </div>
                    </>
                  )}
                </>
              </ModalPopup>
              <PasswordFormModal
                description={t('general.passwordFormModal.description')}
                okButtonText={t('general.passwordFormModal.okButton')}
                onCancel={() => {
                  setInputPasswordVisible(false);
                  setIsNftTransferModalVisible(true);
                }}
                onSuccess={onWalletDecryptFinish}
                onValidatePassword={async (password: string) => {
                  const isValid = await secretStoreService.checkIfPasswordIsValid(password);
                  return {
                    valid: isValid,
                    errMsg: !isValid ? t('general.passwordFormModal.error') : '',
                  };
                }}
                successText={t('general.passwordFormModal.success')}
                title={t('general.passwordFormModal.title')}
                visible={inputPasswordVisible}
                successButtonText={t('general.continue')}
              />
              <SuccessModalPopup
                isModalVisible={isSuccessModalVisible}
                handleCancel={closeSuccessModal}
                handleOk={closeSuccessModal}
                title={t('general.successModalPopup.title')}
                button={null}
                footer={[
                  <Button key="submit" type="primary" onClick={closeSuccessModal}>
                    {t('general.ok')}
                  </Button>,
                ]}
              >
                <>
                  {broadcastResult?.code !== undefined &&
                  broadcastResult?.code !== null &&
                  broadcastResult.code === walletService.BROADCAST_TIMEOUT_CODE ? (
                      <div className="description">
                        {t('general.successModalPopup.timeout.description')}
                      </div>
                    ) : (
                      <div className="description">
                        {t('general.successModalPopup.nftTransfer.description')}
                      </div>
                    )}
                </>
              </SuccessModalPopup>
              <ErrorModalPopup
                isModalVisible={isErrorModalVisible}
                handleCancel={closeErrorModal}
                handleOk={closeErrorModal}
                title={t('general.errorModalPopup.title')}
                footer={[]}
              >
                <>
                  <div className="description">
                    {t('general.errorModalPopup.nftTransfer.description')}
                    <br />
                    {errorMessages
                      .filter((item, idx) => {
                        return errorMessages.indexOf(item) === idx;
                      })
                      .map((err, idx) => (
                        <div key={idx}>- {err}</div>
                      ))}
                    {ledgerIsExpertMode ? (
                      <div>{t('general.errorModalPopup.ledgerExportMode')}</div>
                    ) : (
                      ''
                    )}
                  </div>
                </>
              </ErrorModalPopup>
            </>
          </TabPane>
          <TabPane tab={t('home.nft.tab2')} key="2">
            <NFTTransactionsTab />
          </TabPane>
          <TabPane tab={t('nft.tab2')} key="3">
            <div className="site-layout-background nft-content">
              <div className="container">
                <div className="description">{t('nft.container.description')}</div>
                <FormMintNft />
              </div>
            </div>
          </TabPane>
          <TabPane tab={t('nft.tab3')} key="4">
            <div className="site-layout-background nft-content">
              <div className="container">
                <ReceiveTab />
              </div>
            </div>
          </TabPane>
        </Tabs>
      </Content>

      <Footer />
    </Layout>
  );
};

export default NftPage;
